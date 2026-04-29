import { useEffect, useMemo, useState } from 'react';
import {
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
import { es } from 'date-fns/locale';
import { api } from '../../api';
import { useOfflineStore } from '../../store/offline';
import { toastError, toastInfo, toastSuccess } from '../../store/toast';
import { t } from '../../i18n';
import ConfirmModal from '../../components/ConfirmModal';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import SegmentedControl from '../../components/SegmentedControl';
import type {
  AuthUser,
  CalendarEvent,
  CalendarEventInput,
  DashboardPayload,
} from '../../../../shared/contracts';

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

  const monthWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let i = 0; i < monthDays.length; i += 7) {
      weeks.push(monthDays.slice(i, i + 7));
    }
    return weeks;
  }, [monthDays]);

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
        const message = err instanceof Error ? err.message : 'No se pudo cargar la agenda.';
        setError(message);
        toastError('No se pudo cargar la agenda', message);
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
        const nextDashboardMeta = await api.dashboard.get();
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
      start_datetime: event.start_datetime.slice(0, 16),
      end_datetime: event.end_datetime.slice(0, 16),
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
      toastInfo('Falta un título', 'Ponle un nombre al evento antes de guardar.');
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
        toastInfo('Evento guardado sin conexión', 'Se sincronizará cuando vuelva la red.');
      } else {
        toastSuccess(editingEvent ? 'Evento actualizado' : 'Evento creado');
      }
    } catch (err: unknown) {
      toastError('No se pudo guardar el evento', err instanceof Error ? err.message : 'Revisa los datos e inténtalo de nuevo.');
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
      toastSuccess('Evento eliminado');
    } catch (err: unknown) {
      toastError('No se pudo borrar el evento', err instanceof Error ? err.message : 'Vuelve a intentarlo.');
    }
  };

  const setChoreStatus = async (chore: ChoreInstance, status: string) => {
    try {
      const updated = await api.chores.updateStatus(chore.id, status);
      setChores((current) => current.map((item) => (item.id === chore.id ? { ...item, ...updated } : item)));
      await refreshChoreStats();

      if (updated.pending_sync) {
        toastInfo('Tarea actualizada sin conexión', 'El cambio se sincronizará después.');
      } else {
        toastSuccess(status === 'done' ? 'Tarea completada' : 'Tarea reabierta');
      }
    } catch (err: unknown) {
      toastError('No se pudo actualizar la tarea', err instanceof Error ? err.message : 'Vuelve a intentarlo.');
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
      toastSuccess('Tarea recurrente creada');
    } catch (err: unknown) {
      toastError('No se pudo crear la tarea', err instanceof Error ? err.message : 'Revisa los datos e inténtalo de nuevo.');
    }
  };

  const deleteChore = async () => {
    if (!confirmDeleteChoreId) return;

    try {
      await api.chores.deleteInstance(confirmDeleteChoreId);
      setChores((current) => current.filter((chore) => chore.id !== confirmDeleteChoreId));
      await refreshChoreStats();
      setConfirmDeleteChoreId(null);
      toastSuccess('Rutina eliminada');
    } catch (err: unknown) {
      toastError('No se pudo borrar la tarea', err instanceof Error ? err.message : 'Vuelve a intentarlo.');
    }
  };

  const goToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    setSelectedDate(today);
  };

  if (loading) {
    return (
      <div className="page page-calendar-unified">
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page page-calendar-unified">
      <SectionHeader
        eyebrow="Agenda doméstica"
        title="Agenda y tareas en una sola vista"
        subtitle="Vista mensual combinada, detalle diario y acciones rápidas sin cambiar de módulo."
        actions={
          <div className="header-action-row">
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'Mes' },
                { value: 'agenda', label: 'Día' },
              ]}
            />
            <button type="button" className="btn btn-secondary" onClick={goToday}>
              Hoy
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowChoreModal(true)}>
              Nueva tarea
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openCreateEvent(selectedDate)}>
              {t('calendar.newEvent')}
            </button>
          </div>
        }
      />

      <Surface className="agenda-insight-surface">
        <div className="agenda-insight-shell">
          <div>
            <span className="summary-pill">Resumen visible</span>
            <h2>Qué merece atención hoy</h2>
            <p>
              {error
                ? 'La vista principal sigue disponible, pero no he podido montar todo el contexto adicional.'
                : dashboardMeta?.summary?.text || 'Revisa hoy, desbloquea tareas pendientes y usa esta misma pantalla para crear lo que falte.'}
            </p>
          </div>
          <div className="agenda-insight-meta">
            <span>{selectedDayEvents.length} eventos en el día</span>
            <span>{selectedDayChores.length} tareas en el día</span>
            <span>{isOffline ? 'Sin conexión' : 'Sincronizado'}</span>
          </div>
        </div>
      </Surface>

      <div className="calendar-shell">
        <Surface
          className="calendar-board"
          title={format(currentMonth, 'MMMM yyyy', { locale: es })}
          subtitle="Vista mensual unificada"
          actions={
            <div className="week-switcher">
              <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                {t('common.prev')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                {t('common.next')}
              </button>
            </div>
          }
        >
          <div className="month-grid">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => (
              <div key={label} className="month-grid-head">
                {label}
              </div>
            ))}

            {monthWeeks.flat().map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) || [];
              const dayChores = choresByDay.get(key) || [];
              const visibleItems = [
                ...dayEvents.map((event) => ({ type: 'event' as const, id: event.id, label: event.title, tone: event.category || 'shared' })),
                ...dayChores.map((chore) => ({ type: 'chore' as const, id: chore.id, label: chore.title, tone: chore.status === 'done' ? 'done' : 'pending' })),
              ].slice(0, 3);
              const extraCount = dayEvents.length + dayChores.length - visibleItems.length;

              return (
                <button
                  key={key}
                  type="button"
                  className={`month-cell ${isSameMonth(day, currentMonth) ? '' : 'outside'} ${isSameDay(day, selectedDate) ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`}
                  onClick={() => {
                    setSelectedDate(day);
                    setMode('agenda');
                  }}
                >
                  <div className="month-cell-date">
                    <span>{format(day, 'd')}</span>
                  </div>
                  <div className="month-cell-items">
                    {visibleItems.map((item) => (
                      <span key={`${item.type}-${item.id}`} className={`month-chip ${item.type} ${item.tone}`}>
                        {item.label}
                      </span>
                    ))}
                    {extraCount > 0 ? <span className="month-chip more">+{extraCount} más</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Surface>

        <div className="calendar-side">
          <Surface
            className="day-focus"
            title={format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
            subtitle={`${selectedDayEvents.length} eventos · ${selectedDayChores.length} tareas`}
            actions={
              <div className="header-action-row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCreateEvent(selectedDate)}>
                  Evento
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowChoreModal(true)}>
                  Tarea
                </button>
              </div>
            }
          >
            {mode === 'agenda' || selectedDayEvents.length > 0 || selectedDayChores.length > 0 ? (
              <div className="day-focus-stack">
                <div className="day-focus-group">
                  <div className="day-focus-label">Eventos</div>
                  {selectedDayEvents.length ? (
                    selectedDayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`agenda-card ${event.category || 'shared'} ${event.pending_sync ? 'is-pending' : ''}`}
                        onClick={() => openEditEvent(event)}
                      >
                        <div className="agenda-card-time">{format(new Date(event.start_datetime), 'HH:mm')}</div>
                        <div className="agenda-card-body">
                          <strong>{event.title}</strong>
                          {event.description ? <p>{event.description}</p> : null}
                          {event.pending_sync ? <span className="muted-inline">Pendiente de sincronizar</span> : null}
                        </div>
                      </button>
                    ))
                  ) : (
                    <InlineEmptyState
                      title="Sin eventos en este día"
                      copy="Bloquea tiempo, añade un recordatorio o deja la fecha libre."
                      actionLabel="Crear evento"
                      onAction={() => openCreateEvent(selectedDate)}
                    />
                  )}
                </div>

                <div className="day-focus-group">
                  <div className="day-focus-label">Tareas del hogar</div>
                  {selectedDayChores.length ? (
                    selectedDayChores.map((chore) => (
                      <div key={chore.id} className={`chore-row ${chore.status}`}>
                        <div className="chore-row-copy">
                          <div className="row-inline-meta">
                            <strong>{chore.title}</strong>
                            <span className={`status-badge ${chore.status}`}>{chore.status}</span>
                          </div>
                          <div className="row-inline-meta muted-inline">
                            <span>{chore.location || 'Sin ubicación'}</span>
                            <span>{chore.points} pts</span>
                            {chore.assigned_name ? (
                              <span className="row-inline-meta">
                                <span className="avatar" style={{ background: chore.assigned_color || undefined }}>
                                  {chore.assigned_name[0]}
                                </span>
                                <span>{chore.assigned_name}</span>
                              </span>
                            ) : null}
                            {chore.pending_sync ? <span>Sincronización pendiente</span> : null}
                          </div>
                        </div>

                        <div className="chore-inline-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void setChoreStatus(chore, chore.status === 'done' ? 'pending' : 'done')}
                          >
                            {chore.status === 'done' ? 'Reabrir' : 'Hecha'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteChoreId(chore.id)}>
                            🗑
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <InlineEmptyState
                      title="Sin tareas del hogar en esta fecha"
                      copy="Añade una rutina recurrente para que este día no quede vacío si normalmente toca algo."
                      actionLabel="Crear tarea"
                      onAction={() => setShowChoreModal(true)}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </Surface>

          <Surface title="Actividad del hogar" subtitle="Lo próximo y lo reciente">
            {dashboardMeta?.activity?.length ? (
              <div className="dashboard-activity-list compact">
                {dashboardMeta.activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="activity-row static">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <span>{item.type === 'event' ? 'Agenda' : 'Compra'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state compact left">Todavía no hay actividad reciente destacada.</p>
            )}
          </Surface>

          <Surface title="Resumen visible" subtitle="Completadas en el rango actual">
            {stats.length ? (
              <div className="stack-list compact">
                {stats.map((stat) => (
                  <div key={stat.id} className="list-row">
                    <div className="row-inline-meta">
                      <span className="avatar" style={{ background: stat.color }}>{stat.name[0]}</span>
                      <strong>{stat.name}</strong>
                    </div>
                    <div className="row-inline-meta">
                      <span>{stat.completed ?? 0}</span>
                      <span className="muted-inline">{stat.points ?? 0} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state compact left">Aún no hay tareas completadas en este periodo.</p>
            )}
          </Surface>
        </div>
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
              <span className="modal-title">{editingEvent ? t('calendar.editEvent') : t('calendar.newEvent')}</span>
              <button className="modal-close touch-target" onClick={() => setShowEventModal(false)} aria-label={t('common.close')}>
                ×
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
                  <label className="label">Inicio</label>
                  <input
                    id="event-start"
                    type="datetime-local"
                    className="input"
                    value={eventForm.start_datetime}
                    onChange={(e) => setEventForm((current) => ({ ...current, start_datetime: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Fin</label>
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
                <label className="label">Categoría</label>
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
                <label className="label">Descripción (opcional)</label>
                <textarea
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
              <button className="modal-close touch-target" onClick={() => setShowChoreModal(false)} aria-label={t('common.close')}>
                ×
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
                      <option value="">Sin asignar</option>
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

function InlineEmptyState({
  title,
  copy,
  actionLabel,
  onAction,
}: {
  title: string;
  copy: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state-panel left">
      <strong>{title}</strong>
      <p>{copy}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
