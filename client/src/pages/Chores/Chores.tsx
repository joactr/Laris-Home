import { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { api } from '../../api/client';
import { es } from 'date-fns/locale';
import { t } from '../../i18n';

export default function Chores() {
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [instances, setInstances] = useState<any[]>([]);
    const [stats, setStats] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [filter, setFilter] = useState<'all' | 'mine' | 'partner'>('all');
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [members, setMembers] = useState<any[]>([]);
    const [tForm, setTForm] = useState({ title: '', location: '', recurrence_type: 'weekly', recurrence_days: [1], points: 2, default_assignee_user_id: '', start_date: format(new Date(), 'yyyy-MM-dd'), recurrence_interval: 1 });

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = addDays(weekStart, 6);

    const load = async () => {
        const [inst, st, tmpl, mem] = await Promise.all([
            api.chores.getInstances(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
            api.chores.getStats(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
            api.chores.getTemplates(),
            api.auth.members(),
        ]);
        setInstances(inst); setStats(st); setTemplates(tmpl); setMembers(mem);
    };

    useEffect(() => { load(); }, [weekStart]);

    const setStatus = async (id: string, status: string) => {
        await api.chores.updateStatus(id, status);
        load();
    };

    const deleteInstance = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('¿Seguro que quieres borrar esta tarea y todas las futuras (las pasadas se mantendrán)?')) {
            await api.chores.deleteInstance(id);
            load();
        }
    };

    const createTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let recDays = [1];
        if (tForm.start_date) {
            const [y, m, d] = tForm.start_date.split('-').map(Number);
            const localDate = new Date(y, m - 1, d);
            if (tForm.recurrence_type === 'weekly') {
                recDays = [localDate.getDay()]; // 0 (Sun) to 6 (Sat)
            } else if (tForm.recurrence_type === 'monthly') {
                recDays = [localDate.getDate()]; // 1 to 31
            }
        }

        await api.chores.createTemplate({ 
            ...tForm, 
            recurrence_days: recDays,
            default_assignee_user_id: tForm.default_assignee_user_id || null 
        });
        setShowTemplateModal(false);
        load();
    };

    const instancesForDay = (day: Date) => {
        const ds = format(day, 'yyyy-MM-dd');
        return instances.filter(i => {
            const match = i.scheduled_date.startsWith(ds);
            if (filter === 'all') return match;
            if (filter === 'mine') return match && i.assigned_user_id === members.find(() => true)?.id;
            return match;
        });
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <div className="page-title">{t('page.chores')}</div>
                    <div className="page-subtitle" style={{ textTransform: 'capitalize' }}>
                        {format(weekStart, 'MMM d', { locale: es })} – {format(weekEnd, 'MMM d', { locale: es })}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>←</button>
                    <button className="btn-icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>→</button>
                    <button id="chores-add-template" className="btn btn-primary btn-sm" onClick={() => setShowTemplateModal(true)}>{t('chores.addChore')}</button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
                {stats.map(s => (
                    <div key={s.id} className="stat-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span className="avatar" style={{ background: s.color, width: 28, height: 28, fontSize: 13 }}>{s.name[0]}</span>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                        </div>
                        <div className="stat-value">{s.completed ?? 0}</div>
                        <div className="stat-label">{t('chores.done')}</div>
                        <div style={{ fontWeight: 600, color: 'var(--yellow)', fontSize: 18 }}>{s.points ?? 0} pts</div>
                    </div>
                ))}
                {stats.length === 0 && <div className="stat-card" style={{ color: 'var(--text2)', fontSize: 13 }}>{t('chores.noCompleted')}</div>}
            </div>

            {/* Filter */}
            <div className="filter-tabs" style={{ marginBottom: 14 }}>
                {['all', 'mine', 'partner'].map(f => (
                    <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f as any)}>
                        {f === 'all' ? t('chores.filterAll') : f === 'mine' ? t('chores.filterMine') : t('chores.filterPartner')}
                    </button>
                ))}
            </div>

            {/* Week grid */}
            <div className="chore-week-grid">
                {weekDays.map(day => (
                    <div key={day.toISOString()} className={`chore-day ${isSameDay(day, new Date()) ? 'today-highlight' : ''}`}>
                        <div className="day-header" style={{ textTransform: 'capitalize' }}>{format(day, 'EEE', { locale: es })}</div>
                        <div className="day-number" style={{ textAlign: 'center', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>{format(day, 'd')}</div>
                        {instancesForDay(day).length === 0 && <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>—</p>}
                        {instancesForDay(day).map(inst => (
                            <div key={inst.id} className={`chore-card ${inst.status}`}
                                onClick={() => setStatus(inst.id, inst.status === 'done' ? 'pending' : 'done')}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                    <div className="chore-title" style={{ flex: 1 }}>{inst.title}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {inst.assigned_color && (
                                            <span className="avatar" style={{ background: inst.assigned_color, fontSize: 9, width: 18, height: 18 }}>
                                                {inst.assigned_name?.[0]}
                                            </span>
                                        )}
                                        <button className="btn-icon" onClick={(e) => deleteInstance(inst.id, e)} style={{ padding: 2, fontSize: 14, opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer' }}>
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                <div className="chore-points">⭐ {inst.points} pts</div>
                                <div style={{ fontSize: 10, marginTop: 3, color: inst.status === 'done' ? 'var(--green)' : 'var(--text2)' }}>
                                    {inst.status}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Template modal */}
            {showTemplateModal && (
                <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('chores.newRecurring')}</span>
                            <button className="modal-close" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <form onSubmit={createTemplate}>
                            <div className="form-group">
                                <label className="label">{t('common.title')}</label>
                                <input id="chore-title" className="input" value={tForm.title} onChange={e => setTForm(f => ({ ...f, title: e.target.value }))} required autoFocus />
                            </div>
                            <div className="form-group field-row">
                                <div style={{ flex: 1 }}>
                                    <label className="label">{t('chores.location')}</label>
                                    <input className="input" value={tForm.location} onChange={e => setTForm(f => ({ ...f, location: e.target.value }))} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="label">{t('chores.startDate')}</label>
                                    <input type="date" className="input" value={tForm.start_date} onChange={e => setTForm(f => ({ ...f, start_date: e.target.value }))} required />
                                </div>
                            </div>
                            <div className="form-group field-row">
                                <div style={{ flex: 1 }}>
                                    <label className="label">{t('chores.recurrence')}</label>
                                    <select className="input" value={tForm.recurrence_type} onChange={e => setTForm(f => ({ ...f, recurrence_type: e.target.value }))}>
                                        <option value="daily">{t('chores.daily')}</option>
                                        <option value="weekly">{t('chores.weekly')}</option>
                                        <option value="monthly">{t('chores.monthly')}</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="label">{t('chores.interval')}</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input className="input" type="number" min={1} max={99} value={tForm.recurrence_interval} onChange={e => setTForm(f => ({ ...f, recurrence_interval: parseInt(e.target.value) || 1 }))} style={{ width: 60 }} />
                                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                                            {tForm.recurrence_type === 'daily' ? t('chores.intervalDays') : tForm.recurrence_type === 'weekly' ? t('chores.intervalWeeks') : t('chores.intervalMonths')}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="label">{t('chores.points')}</label>
                                    <input className="input" type="number" min={1} max={10} value={tForm.points} onChange={e => setTForm(f => ({ ...f, points: parseInt(e.target.value) }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">{t('chores.assignTo')}</label>
                                <select className="input" value={tForm.default_assignee_user_id} onChange={e => setTForm(f => ({ ...f, default_assignee_user_id: e.target.value }))}>
                                    <option value="">{t('chores.anyone')}</option>
                                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>{t('common.cancel')}</button>
                                <button id="chore-save" type="submit" className="btn btn-primary">{t('common.create')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
