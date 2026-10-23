import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { dateFormats, dateLocale } from '../../i18n/date';
import { api } from '../../api';
import { useOfflineStore } from '../../store/offline';
import { toastError, toastInfo, toastSuccess } from '../../store/toast';
import { t } from '../../i18n';
import ConfirmModal from '../../components/ConfirmModal';
import Icon from '../../components/Icon';
import SectionHeader from '../../components/SectionHeader';
import SegmentedControl from '../../components/SegmentedControl';
import type {
  AuthUser,
  CalendarEvent,
  CalendarEventInput,
  DashboardPayload,
} from '../../../../shared/contracts';
import './Calendar.css';

interface EventForm {
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string;
  category: 'personal' | 'shared' | 'reminder';
}

type ChoreForm = {
  title: string;
  location: string;
  recurrence_type: 'daily' | 'weekly' | 'monthly';
  recurrence_interval: number;
  points: number;
  default_assignee_user_id: string;
  start_date: string;
};

type AgendaMode = 'month' | 'agenda';

type DashboardMeta = {
  summary?: { text?: string };
  activity?: Array<{ id: string; title: string; detail: string; path: string; type: string }>;
};

type ChoreInstance = {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
  location?: string | null;
  points?: number | null;
  assigned_user_id?: string | null;
  assigned_name?: string | null;
  assigned_color?: string | null;
  completed_at?: string | null;
  pending_sync?: boolean;
};

type ChoreStat = {
  id: string;
  name: string;
  color: string;
  completed: number;
  points: number;
};

const WEEKDAY_KEYS = ['cal.wdMon', 'cal.wdTue', 'cal.wdWed', 'cal.wdThu', 'cal.wdFri', 'cal.wdSat', 'cal.wdSun'];

/** Formatea un datetime almacenado como valor local para `datetime-local`. */
function toLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(+date)) return value.slice(0, 16);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export default function Calendar() {
  const [mode, setMode] = useState<AgendaMode>('month');
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [chores, setChores] = useState<ChoreInstance[]>([]);
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [stats, setStats] = useState<ChoreStat[]>([]);
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>({
    title: '',
    description: '',
    start_datetime: '',
    end_datetime: '',
    category: 'shared',
  });
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);

  const [showChoreModal, setShowChoreModal] = useState(false);
  const [confirmDeleteChoreId, setConfirmDeleteChoreId] = useState<string | null>(null);
  const [choreForm, setChoreForm] = useState<ChoreForm>({
    title: '',
    location: '',
    recurrence_type: 'weekly',
    recurrence_interval: 1,
    points: 2,
    default_assignee_user_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const isOffline = useOfflineStore((s) => s.isOffline);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);

  const monthDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  );

  const dayKey = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [nextEvents, nextChores, nextMembers, nextStats] = await Promise.all([
          api.calendar.getEvents(
            format(gridStart, "yyyy-MM-dd'T'00:00:00'Z'"),
            format(gridEnd, "yyyy-MM-dd'T'23:59:59'Z'")
          ),
          api.chores.getInstances(format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd')),
          api.auth.members(),
          api.chores.getStats(format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd')),
        ]);

        if (!active) return;
        setEvents(nextEvents);
        setChores(nextChores);
        setMembers(nextMembers);
        setStats(nextStats);
        setError(null);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : t('cal.loadFailed');
        setError(message);
        toastError(t('cal.loadFailed'), message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [gridStart, gridEnd]);

  useEffect(() => {
    let active = true;

    const loadDashboardMeta = async () => {
      try {
        const nextDashboardMeta: DashboardPayload = await api.dashboard.get();
        if (!active) return;
        setDashboardMeta(nextDashboardMeta);
      } catch {
        // Secondary context should not block agenda rendering.
      }
    };

    void loadDashboardMeta();
    return () => {
      active = false;
    };
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = format(new Date(event.start_datetime), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) || []), event]);
    }
    return map;
  }, [events]);

  const choresByDay = useMemo(() => {
    const map = new Map<string, ChoreInstance[]>();
    for (const chore of chores) {
      const key = String(chore.scheduled_date).slice(0, 10);
      map.set(key, [...(map.get(key) || []), chore]);
    }
    return map;
  }, [chores]);

  const selectedDayEvents = [...(eventsByDay.get(dayKey) || [])].sort(
    (a, b) => +new Date(a.start_datetime) - +new Date(b.start_datetime)
  );
  const selectedDayChores = [...(choresByDay.get(dayKey) || [])].sort((a, b) => a.title.localeCompare(b.title));

  const openCreateEvent = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setEditingEvent(null);
    setEventForm({
      title: '',
      description: '',
      start_datetime: `${dateStr}T10:00`,
      end_datetime: `${dateStr}T11:00`,
      category: 'shared',
    });
    setShowEventModal(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventForm({
      title: event.title,
      description: event.description || '',
      start_datetime: toLocalInput(event.start_datetime),
      end_datetime: toLocalInput(event.end_datetime),
      category: event.category || 'shared',
    });
    setShowEventModal(true);
  };

  const refreshChoreStats = async () => {
    try {
      const nextStats = await api.chores.getStats(format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd'));
      setStats(nextStats);
    } catch {
      // Stats are secondary; avoid noisy failures here.
    }
  };

  const saveEvent = async () => {
    if (!eventForm.title.trim()) {
      toastInfo(t('cal.titleMissing'), t('cal.titleMissingHint'));
      return;
    }

    try {
      const saved = editingEvent
        ? await api.calendar.updateEvent(editingEvent.id, eventForm as CalendarEventInput)
        : await api.calendar.createEvent(eventForm as CalendarEventInput);

      setEvents((current) => {
        const next = [...current.filter((item) => item.id !== saved.id), saved];
        return next.sort((a, b) => +new Date(a.start_datetime) - +new Date(b.start_datetime));
      });
      setSelectedDate(new Date(saved.start_datetime));
      setCurrentMonth(startOfMonth(new Date(saved.start_datetime)));
      setShowEventModal(false);
      setEditingEvent(null);

      if (saved.pending_sync) {
        toastInfo(t('cal.eventSavedOffline'), t('cal.eventSavedOfflineHint'));
      } else {
        toastSuccess(editingEvent ? t('cal.eventUpdated') : t('cal.eventCreated'));
      }
    } catch (err: unknown) {
      toastError(t('cal.saveEventFailed'), err instanceof Error ? err.message : t('cal.checkData'));
    }
  };

  const deleteEvent = async () => {
    if (!confirmDeleteEventId) return;

    try {
      await api.calendar.deleteEvent(confirmDeleteEventId);
      setEvents((current) => current.filter((event) => event.id !== confirmDeleteEventId));
      setConfirmDeleteEventId(null);
      setShowEventModal(false);
      setEditingEvent(null);
      toastSuccess(t('cal.eventDeleted'));
    } catch (err: unknown) {
      toastError(t('cal.deleteEventFailed'), err instanceof Error ? err.message : t('cal.retry'));
    }
  };

  const setChoreStatus = async (chore: ChoreInstance, status: string) => {
    try {
      const updated = await api.chores.updateStatus(chore.id, status);
      setChores((current) => current.map((item) => (item.id === chore.id ? { ...item, ...updated } : item)));
      await refreshChoreStats();

      if (updated.pending_sync) {
        toastInfo(t('cal.choreUpdatedOffline'), t('cal.choreSyncLater'));
      } else {
        toastSuccess(status === 'done' ? t('cal.choreDone') : t('cal.choreReopened'));
      }
    } catch (err: unknown) {
      toastError(t('cal.updateChoreFailed'), err instanceof Error ? err.message : t('cal.retry'));
    }
  };

  const createChoreTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const [y, m, d] = choreForm.start_date.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    const recurrenceDays =
      choreForm.recurrence_type === 'monthly' ? [localDate.getDate()] : [localDate.getDay()];

    try {
      await api.chores.createTemplate({
        ...choreForm,
        recurrence_days: recurrenceDays,
        default_assignee_user_id: choreForm.default_assignee_user_id || null,
      });

      const nextChores = await api.chores.getInstances(format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd'));
      setChores(nextChores);
      await refreshChoreStats();
      setShowChoreModal(false);
      setChoreForm({
        title: '',
        location: '',
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        points: 2,
        default_assignee_user_id: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
      });
      toastSuccess(t('cal.choreCreated'));
    } catch (err: unknown) {
      toastError(t('cal.createChoreFailed'), err instanceof Error ? err.message : t('cal.checkData'));
    }
  };

  const deleteChore = async () => {
    if (!confirmDeleteChoreId) return;

    try {
      await api.chores.deleteInstance(confirmDeleteChoreId);
      setChores((current) => current.filter((chore) => chore.id !== confirmDeleteChoreId));
      await refreshChoreStats();
      setConfirmDeleteChoreId(null);
      toastSuccess(t('cal.choreDeleted'));
    } catch (err: unknown) {
      toastError(t('cal.deleteChoreFailed'), err instanceof Error ? err.message : t('cal.retry'));
    }
  };

  const goToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    setSelectedDate(today);
  };

  const stepDay = (delta: number) => {
    const next = addDays(selectedDate, delta);
    setSelectedDate(next);
    setCurrentMonth(startOfMonth(next));
  };

  const toolbarLabel =
    mode === 'month'
      ? format(currentMonth, 'MMMM yyyy', { locale: dateLocale() })
      : format(selectedDate, dateFormats.weekdayDayMonth(), { locale: dateLocale() });

  if (loading) {
    return (
      <div className="page">
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <SectionHeader
        title={t('page.calendar')}
        actions={
          <div className="cal-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowChoreModal(true)}>
              <Icon name="plus" size={16} />
              {t('cal.newTask')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openCreateEvent(selectedDate)}>
              <Icon name="plus" size={16} />
              {t('cal.newEvent')}
            </button>
          </div>
        }
      />

      <div className="cal-toolbar">
        <div className="cal-month-nav">
          <button
            type="button"
            className="btn btn-ghost btn-icon cal-nav-btn"
            aria-label={mode === 'month' ? t('cal.prevMonth') : t('cal.prevDay')}
            onClick={() => (mode === 'month' ? setCurrentMonth(subMonths(currentMonth, 1)) : stepDay(-1))}
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <h2>{toolbarLabel}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon cal-nav-btn"
            aria-label={mode === 'month' ? t('cal.nextMonth') : t('cal.nextDay')}
            onClick={() => (mode === 'month' ? setCurrentMonth(addMonths(currentMonth, 1)) : stepDay(1))}
          >
            <Icon name="chevronRight" size={18} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
            {t('cal.today')}
          </button>
        </div>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: t('cal.modeMonth') },
            { value: 'agenda', label: t('cal.modeDay') },
          ]}
        />
      </div>

      {error ? <p className="cal-offline">{error}</p> : null}
      {isOffline ? <p className="cal-offline">{t('cal.offline')}</p> : null}

      <div className="cal-layout">
        {mode === 'month' ? (
          <section aria-label={format(currentMonth, 'MMMM yyyy', { locale: dateLocale() })}>
            <div className="cal-weekhead" aria-hidden="true">
              {WEEKDAY_KEYS.map((key) => (
                <span key={key}>{t(key)}</span>
              ))}
            </div>
            <div className="cal-grid">
              {monthDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay.get(key) || [];
                const dayChores = choresByDay.get(key) || [];
                const visible = [
                  ...dayEvents.map((event) => ({
                    id: `event-${event.id}`,
                    label: event.title,
                    done: false,
                  })),
                  ...dayChores.map((chore) => ({
                    id: `chore-${chore.id}`,
                    label: chore.title,
                    done: chore.status === 'done',
                  })),
                ].slice(0, 3);
                const extraCount = dayEvents.length + dayChores.length - visible.length;
                const itemCount = dayEvents.length + dayChores.length;
                const dayLabel = format(day, dateFormats.weekdayDayMonth(), { locale: dateLocale() });
                const dayAria = itemCount
                  ? `${dayLabel}, ${t(itemCount === 1 ? 'cal.itemsOne' : 'cal.itemsMany', itemCount)}`
                  : dayLabel;

                return (
                  <button
                    key={key}
                    type="button"
                    className={`cal-cell ${isSameMonth(day, currentMonth) ? '' : 'outside'} ${isSameDay(day, selectedDate) ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`.trim()}
                    onClick={() => setSelectedDate(day)}
                    aria-label={dayAria}
                    aria-pressed={isSameDay(day, selectedDate)}
                  >
                    <span className="cal-date">{format(day, 'd')}</span>
                    <span className="cal-items">
                      {visible.map((item) => (
                        <span key={item.id} className={`cal-item ${item.done ? 'done' : ''}`}>
                          <span className="cal-item-label">{item.label}</span>
                        </span>
                      ))}
                      {extraCount > 0 ? <span className="cal-more">{t('cal.more', extraCount)}</span> : null}
                    </span>
                    {itemCount > 0 ? <span className="cal-cell-count" aria-hidden="true">{itemCount}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="cal-day" aria-label={t('cal.dayDetail')}>
          {mode === 'agenda' ? null : (
            <>
              <h2>{format(selectedDate, dateFormats.weekdayDayMonth(), { locale: dateLocale() })}</h2>
              <p className="cal-day-counts">
                {t(selectedDayEvents.length === 1 ? 'cal.eventsOne' : 'cal.eventsMany', selectedDayEvents.length)}, {t(selectedDayChores.length === 1 ? 'cal.choresOne' : 'cal.choresMany', selectedDayChores.length)}
              </p>
            </>
          )}

          <div className="cal-group">
            <h3>{t('cal.events')}</h3>
            {selectedDayEvents.length ? (
              <ul className="cal-list">
                {selectedDayEvents.map((event) => (
                  <li key={event.id}>
                    <button type="button" className="cal-event" onClick={() => openEditEvent(event)}>
                      <span className="cal-event-time">{format(new Date(event.start_datetime), 'HH:mm')}</span>
                      <span className="cal-event-title">{event.title}</span>
                      {event.description ? <span className="cal-event-desc">{event.description}</span> : null}
                      {event.pending_sync ? <span className="cal-pending">{t('cal.pendingSync')}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <p>{t('cal.noEventsDay')}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCreateEvent(selectedDate)}>
                  {t('cal.createEvent')}
                </button>
              </div>
            )}
          </div>

          <div className="cal-group">
            <h3>{t('cal.chores')}</h3>
            {selectedDayChores.length ? (
              <ul className="cal-list">
                {selectedDayChores.map((chore) => (
                  <li key={chore.id} className={`cal-chore ${chore.status === 'done' ? 'done' : ''}`}>
                    <div>
                      <span className="cal-chore-title">{chore.title}</span>
                      <span className="cal-chore-meta">
                        <span>{chore.location || t('cal.noLocation')}</span>
                        <span>{t((chore.points ?? 0) === 1 ? 'cal.pointsOne' : 'cal.pointsMany', chore.points ?? 0)}</span>
                        {chore.assigned_name ? (
                          <span className="cal-assignee">
                            <span
                              className="cal-avatar"
                              style={{ background: chore.assigned_color || undefined }}
                              aria-hidden="true"
                            >
                              {chore.assigned_name[0]}
                            </span>
                            {chore.assigned_name}
                          </span>
                        ) : null}
                        {chore.pending_sync ? <span>{t('cal.syncPending')}</span> : null}
                      </span>
                    </div>
                    <div className="cal-chore-actions">
                      <button
                        type="button"
                        className="cal-textbtn"
                        onClick={() => void setChoreStatus(chore, chore.status === 'done' ? 'pending' : 'done')}
                      >
                        {chore.status === 'done' ? t('cal.reopen') : t('cal.done')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon cal-iconbtn"
                        aria-label={t('cal.deleteChore', chore.title)}
                        onClick={() => setConfirmDeleteChoreId(chore.id)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <p>{t('cal.noChoresDay')}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowChoreModal(true)}>
                  {t('cal.createChore')}
                </button>
              </div>
            )}
          </div>

          <div className="cal-context">
            {dashboardMeta?.summary?.text ? (
              <section aria-label={t('cal.summary')}>
                <h3>{t('cal.summary')}</h3>
                <p>{dashboardMeta.summary.text}</p>
              </section>
            ) : null}

            <section aria-label={t('cal.homeActivity')}>
              <h3>{t('cal.homeActivity')}</h3>
              {dashboardMeta?.activity?.length ? (
                <ul className="cal-plain-list">
                  {dashboardMeta.activity.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <div>
                        <span className="cal-activity-title">{item.title}</span>
                        <p className="cal-activity-detail">{item.detail}</p>
                      </div>
                      <span className="cal-activity-kind">{item.type === 'event' ? t('cal.kindAgenda') : t('cal.kindShopping')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('cal.noActivity')}</p>
              )}
            </section>

            <section aria-label={t('cal.pointsByPerson')}>
              <h3>{t('cal.pointsByPerson')}</h3>
              {stats.length ? (
                <ul className="cal-plain-list">
                  {stats.map((stat) => (
                    <li key={stat.id}>
                      <span className="cal-rank">
                        <span className="cal-avatar" style={{ background: stat.color }} aria-hidden="true">
                          {stat.name[0]}
                        </span>
                        {stat.name}
                      </span>
                      <span className="cal-rank-points">
                        {t((stat.completed ?? 0) === 1 ? 'cal.doneOne' : 'cal.doneMany', stat.completed ?? 0)}, {t((stat.points ?? 0) === 1 ? 'cal.pointsOne' : 'cal.pointsMany', stat.points ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('cal.noPoints')}</p>
              )}
            </section>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteEventId}
        title={t('common.delete')}
        message={t('calendar.deleteConfirm')}
        onConfirm={deleteEvent}
        onCancel={() => setConfirmDeleteEventId(null)}
        isDanger
      />

      <ConfirmModal
        isOpen={!!confirmDeleteChoreId}
        title={t('common.delete')}
        message={t('chores.deleteConfirm')}
        onConfirm={deleteChore}
        onCancel={() => setConfirmDeleteChoreId(null)}
        isDanger
      />

      {showEventModal ? (
        <div className="modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingEvent ? t('calendar.editEvent') : t('cal.newEventTitle')}</span>
              <button
                className="modal-close cal-modal-close"
                onClick={() => setShowEventModal(false)}
                aria-label={t('common.close')}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label" htmlFor="event-title">
                  {t('common.title')}
                </label>
                <input
                  id="event-title"
                  className="input"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((current) => ({ ...current, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="field-grid two">
                <div className="form-group">
                  <label className="label" htmlFor="event-start">{t('cal.start')}</label>
                  <input
                    id="event-start"
                    type="datetime-local"
                    className="input"
                    value={eventForm.start_datetime}
                    onChange={(e) => setEventForm((current) => ({ ...current, start_datetime: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="event-end">{t('cal.end')}</label>
                  <input
                    id="event-end"
                    type="datetime-local"
                    className="input"
                    value={eventForm.end_datetime}
                    onChange={(e) => setEventForm((current) => ({ ...current, end_datetime: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="event-category">{t('cal.category')}</label>
                <select
                  id="event-category"
                  className="input"
                  value={eventForm.category}
                  onChange={(e) => setEventForm((current) => ({ ...current, category: e.target.value as EventForm['category'] }))}
                >
                  <option value="shared">{t('calendar.category.shared')}</option>
                  <option value="personal">{t('calendar.category.personal')}</option>
                  <option value="reminder">{t('calendar.category.reminder')}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="event-description">{t('cal.descriptionOpt')}</label>
                <textarea
                  id="event-description"
                  className="input"
                  value={eventForm.description}
                  onChange={(e) => setEventForm((current) => ({ ...current, description: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-actions">
              {editingEvent ? (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDeleteEventId(editingEvent.id)}>
                  {t('common.delete')}
                </button>
              ) : null}
              <div className="modal-actions-spacer" />
              <button type="button" className="btn btn-secondary" onClick={() => setShowEventModal(false)}>
                {t('common.cancel')}
              </button>
              <button id="event-save" type="button" className="btn btn-primary" onClick={() => void saveEvent()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showChoreModal ? (
        <div className="modal-overlay" onClick={() => setShowChoreModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('chores.newRecurring')}</span>
              <button
                className="modal-close cal-modal-close"
                onClick={() => setShowChoreModal(false)}
                aria-label={t('common.close')}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={createChoreTemplate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="label">{t('common.title')}</label>
                  <input
                    className="input"
                    value={choreForm.title}
                    onChange={(e) => setChoreForm((current) => ({ ...current, title: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="field-grid two">
                  <div className="form-group">
                    <label className="label">{t('chores.location')}</label>
                    <input
                      className="input"
                      value={choreForm.location}
                      onChange={(e) => setChoreForm((current) => ({ ...current, location: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">{t('chores.points')}</label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={choreForm.points}
                      onChange={(e) => setChoreForm((current) => ({ ...current, points: Number(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="field-grid two">
                  <div className="form-group">
                    <label className="label">{t('chores.recurrence')}</label>
                    <select
                      className="input"
                      value={choreForm.recurrence_type}
                      onChange={(e) => setChoreForm((current) => ({ ...current, recurrence_type: e.target.value as ChoreForm['recurrence_type'] }))}
                    >
                      <option value="daily">{t('chores.daily')}</option>
                      <option value="weekly">{t('chores.weekly')}</option>
                      <option value="monthly">{t('chores.monthly')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">{t('chores.interval')}</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={choreForm.recurrence_interval}
                      onChange={(e) => setChoreForm((current) => ({ ...current, recurrence_interval: Number(e.target.value) || 1 }))}
                    />
                  </div>
                </div>
                <div className="field-grid two">
                  <div className="form-group">
                    <label className="label">{t('chores.startDate')}</label>
                    <input
                      type="date"
                      className="input"
                      value={choreForm.start_date}
                      onChange={(e) => setChoreForm((current) => ({ ...current, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">{t('chores.assignTo')}</label>
                    <select
                      className="input"
                      value={choreForm.default_assignee_user_id}
                      onChange={(e) => setChoreForm((current) => ({ ...current, default_assignee_user_id: e.target.value }))}
                    >
                      <option value="">{t('cal.unassigned')}</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <div className="modal-actions-spacer" />
                <button type="button" className="btn btn-secondary" onClick={() => setShowChoreModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
