import { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '../../api';
import { t } from '../../i18n';
import ConfirmModal from '../../components/ConfirmModal';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import SegmentedControl from '../../components/SegmentedControl';

export default function Chores() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [instances, setInstances] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'mine' | 'partner'>('all');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [tForm, setTForm] = useState({
    title: '',
    location: '',
    recurrence_type: 'weekly',
    recurrence_days: [1],
    points: 2,
    default_assignee_user_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    recurrence_interval: 1,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = addDays(weekStart, 6);

  const load = async () => {
    const [nextInstances, nextStats, , nextMembers] = await Promise.all([
      api.chores.getInstances(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
      api.chores.getStats(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
      api.chores.getTemplates(),
      api.auth.members(),
    ]);
    setInstances(nextInstances);
    setStats(nextStats);
    setMembers(nextMembers);
  };

  useEffect(() => {
    void load();
  }, [weekStart]);

  const setStatus = async (id: string, status: string) => {
    await api.chores.updateStatus(id, status);
    await load();
  };

  const handleDeleteInstance = async () => {
    if (!confirmDeleteId) return;
    await api.chores.deleteInstance(confirmDeleteId);
    setConfirmDeleteId(null);
    await load();
  };

  const createTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    let recDays = [1];
    if (tForm.start_date) {
      const [y, m, d] = tForm.start_date.split('-').map(Number);
      const localDate = new Date(y, m - 1, d);
      if (tForm.recurrence_type === 'weekly') {
        recDays = [localDate.getDay()];
      } else if (tForm.recurrence_type === 'monthly') {
        recDays = [localDate.getDate()];
      }
    }

    await api.chores.createTemplate({
      ...tForm,
      recurrence_days: recDays,
      default_assignee_user_id: tForm.default_assignee_user_id || null,
    });
    setShowTemplateModal(false);
    await load();
  };

  const currentMemberId = members[0]?.id;

  const instancesForDay = (day: Date) => {
    const dayString = format(day, 'yyyy-MM-dd');
    return instances.filter((instance) => {
      const matchesDate = instance.scheduled_date.startsWith(dayString);
      if (!matchesDate) return false;
      if (filter === 'all') return true;
      if (filter === 'mine') return instance.assigned_user_id === currentMemberId;
      return instance.assigned_user_id !== currentMemberId;
    });
  };

  return (
    <div className="page page-chores">
      <SectionHeader
        eyebrow="Rutina doméstica"
        title={t('page.chores')}
        subtitle={`${format(weekStart, 'MMM d', { locale: es })} - ${format(weekEnd, 'MMM d, yyyy', { locale: es })}`}
        actions={
          <div className="header-action-row">
            <div className="week-switcher">
              <button type="button" className="btn btn-secondary" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                {t('common.prev')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                {t('common.next')}
              </button>
            </div>
            <button type="button" id="chores-add-template" className="btn btn-primary" onClick={() => setShowTemplateModal(true)}>
              {t('chores.addChore')}
            </button>
          </div>
        }
      />

      <div className="stats-grid">
        {stats.length ? (
          stats.map((stat) => (
            <Surface key={stat.id} className="stat-surface" as="article">
              <div className="stat-person">
                <span className="avatar avatar-lg" style={{ background: stat.color }}>
                  {stat.name[0]}
                </span>
                <div>
                  <strong>{stat.name}</strong>
                  <p>{t('chores.done')}</p>
                </div>
              </div>
              <div className="stat-value">{stat.completed ?? 0}</div>
              <div className="stat-foot">{stat.points ?? 0} pts</div>
            </Surface>
          ))
        ) : (
          <Surface>
            <p className="empty-state compact left">{t('chores.noCompleted')}</p>
          </Surface>
        )}
      </div>

      <SegmentedControl
        value={filter}
        onChange={(value) => setFilter(value)}
        options={[
          { value: 'all', label: t('chores.filterAll') },
          { value: 'mine', label: t('chores.filterMine') },
          { value: 'partner', label: t('chores.filterPartner') },
        ]}
        className="chores-filter"
      />

      <div className="planner-stack">
        {weekDays.map((day) => {
          const dayInstances = instancesForDay(day);
          return (
            <Surface
              key={day.toISOString()}
              className={`planner-day ${isSameDay(day, new Date()) ? 'today' : ''}`}
              title={format(day, "EEEE d 'de' MMMM", { locale: es })}
              subtitle={dayInstances.length ? `${dayInstances.length} tareas` : 'Sin tareas previstas'}
            >
              {dayInstances.length ? (
                <div className="stack-list">
                  {dayInstances.map((instance) => (
                    <div
                      key={instance.id}
                      className={`chore-row ${instance.status}`}
                      onClick={() => void setStatus(instance.id, instance.status === 'done' ? 'pending' : 'done')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void setStatus(instance.id, instance.status === 'done' ? 'pending' : 'done');
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="chore-row-copy">
                        <div className="row-inline-meta">
                          <strong>{instance.title}</strong>
                          <span className={`status-badge ${instance.status}`}>{instance.status}</span>
                        </div>
                        <div className="row-inline-meta muted-inline">
                          <span>{instance.location || 'Sin ubicación'}</span>
                          <span>{instance.points} pts</span>
                          {instance.assigned_name ? (
                            <span className="row-inline-meta">
                              <span className="avatar" style={{ background: instance.assigned_color }}>
                                {instance.assigned_name[0]}
                              </span>
                              <span>{instance.assigned_name}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(instance.id);
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact left">Nada que tachar aquí.</div>
              )}
            </Surface>
          );
        })}
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title={t('common.delete')}
        message={t('chores.deleteConfirm')}
        onConfirm={handleDeleteInstance}
        onCancel={() => setConfirmDeleteId(null)}
        isDanger
      />

      {showTemplateModal ? (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('chores.newRecurring')}</span>
              <button className="modal-close touch-target" onClick={() => setShowTemplateModal(false)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <form onSubmit={createTemplate}>
              <div className="form-group">
                <label className="label" htmlFor="chore-title">
                  {t('common.title')}
                </label>
                <input
                  id="chore-title"
                  className="input"
                  value={tForm.title}
                  onChange={(e) => setTForm((current) => ({ ...current, title: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div className="field-grid two">
                <div className="form-group">
                  <label className="label">{t('chores.location')}</label>
                  <input
                    className="input"
                    value={tForm.location}
                    onChange={(e) => setTForm((current) => ({ ...current, location: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label">{t('chores.startDate')}</label>
                  <input
                    type="date"
                    className="input"
                    value={tForm.start_date}
                    onChange={(e) => setTForm((current) => ({ ...current, start_date: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="field-grid three">
                <div className="form-group">
                  <label className="label">{t('chores.recurrence')}</label>
                  <select
                    className="input"
                    value={tForm.recurrence_type}
                    onChange={(e) => setTForm((current) => ({ ...current, recurrence_type: e.target.value }))}
                  >
                    <option value="daily">{t('chores.daily')}</option>
                    <option value="weekly">{t('chores.weekly')}</option>
                    <option value="monthly">{t('chores.monthly')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">{t('chores.interval')}</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={99}
                    value={tForm.recurrence_interval}
                    onChange={(e) =>
                      setTForm((current) => ({ ...current, recurrence_interval: parseInt(e.target.value, 10) || 1 }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="label">{t('chores.points')}</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10}
                    value={tForm.points}
                    onChange={(e) => setTForm((current) => ({ ...current, points: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">{t('chores.assignTo')}</label>
                <select
                  className="input"
                  value={tForm.default_assignee_user_id}
                  onChange={(e) => setTForm((current) => ({ ...current, default_assignee_user_id: e.target.value }))}
                >
                  <option value="">{t('chores.anyone')}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>
                  {t('common.cancel')}
                </button>
                <button id="chore-save" type="submit" className="btn btn-primary">
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
