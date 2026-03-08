import { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { api } from '../../api/client';
import { es } from 'date-fns/locale';
import { t } from '../../i18n';
import ConfirmModal from '../../components/ConfirmModal';

interface EventForm {
    title: string;
    description: string;
    start_datetime: string;
    end_datetime: string;
    category: 'personal' | 'shared' | 'reminder';
}

export default function Calendar() {
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [events, setEvents] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState<EventForm>({
        title: '', description: '',
        start_datetime: '', end_datetime: '',
        category: 'shared',
    });
    
    // Modal state
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = addDays(weekStart, 6);

    const loadEvents = async () => {
        const data = await api.calendar.getEvents(
            format(weekStart, "yyyy-MM-dd'T'00:00:00'Z'"),
            format(weekEnd, "yyyy-MM-dd'T'23:59:59'Z'")
        );
        setEvents(data);
    };

    useEffect(() => { loadEvents(); }, [weekStart]);

    const openCreate = (day: Date) => {
        setEditing(null);
        const dateStr = format(day, 'yyyy-MM-dd');
        setForm({ title: '', description: '', start_datetime: `${dateStr}T10:00`, end_datetime: `${dateStr}T11:00`, category: 'shared' });
        setShowModal(true);
    };

    const openEdit = (ev: any) => {
        setEditing(ev);
        setForm({
            title: ev.title, description: ev.description || '',
            start_datetime: ev.start_datetime.slice(0, 16),
            end_datetime: ev.end_datetime.slice(0, 16),
            category: ev.category || 'shared',
        });
        setShowModal(true);
    };

    const save = async () => {
        if (!form.title.trim()) return;
        if (editing) {
            await api.calendar.updateEvent(editing.id, form);
        } else {
            await api.calendar.createEvent(form);
        }
        setShowModal(false);
        loadEvents();
    };

    const handleDeleteEvent = async () => {
        if (!confirmDeleteId) return;
        await api.calendar.deleteEvent(confirmDeleteId);
        setConfirmDeleteId(null);
        setShowModal(false);
        loadEvents();
    };

    const eventsForDay = (day: Date) =>
        events.filter(e => isSameDay(new Date(e.start_datetime), day));

    return (
        <div className="page full-width">
            <div className="page-header">
                <div className="week-nav">
                    <button className="btn-icon touch-target" onClick={() => setWeekStart(subWeeks(weekStart, 1))} aria-label={t('common.prev')}>←</button>
                    <span className="week-label" style={{ textTransform: 'capitalize' }}>
                        {format(weekStart, 'MMM d', { locale: es })} – {format(weekEnd, 'MMM d, yyyy', { locale: es })}
                    </span>
                    <button className="btn-icon touch-target" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label={t('common.next')}>→</button>
                </div>
                <button id="calendar-add" className="btn btn-primary btn-sm touch-target" onClick={() => openCreate(new Date())}>{t('calendar.newEvent')}</button>
            </div>

            {/* Week grid */}
            <div className="week-grid h-scroll-wrapper">
                <div className="h-scroll-container">
                    <div className="calendar-grid">
                        {weekDays.map(day => (
                            <div key={day.toISOString()} className={`day-col ${isSameDay(day, new Date()) ? 'today-highlight' : ''}`}>
                                <div className="day-header">{format(day, 'EEE', { locale: es })}</div>
                                <div className={`day-number ${isSameDay(day, new Date()) ? 'today' : ''}`}>{format(day, 'd')}</div>
                                <div className="day-events">
                                    {eventsForDay(day).map(e => (
                                        <div key={e.id} className={`event-chip ${e.category}`} onClick={() => openEdit(e)} title={e.title}>
                                            {e.title}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className="day-add-btn touch-target"
                                    onClick={() => openCreate(day)}
                                    aria-label={t('calendar.addEvent')}
                                >+</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Event list */}
            <div className="card" style={{ marginTop: 12 }}>
                <div className="dash-section-title">📋 {t('calendar.thisWeek')}</div>
                {events.length === 0 && <p className="empty-state">{t('calendar.noEvents')}</p>}
                <div className="event-list">
                    {events.map(e => (
                        <div key={e.id} className="event-list-item">
                            <div className="event-time" style={{ textTransform: 'capitalize' }}>{format(new Date(e.start_datetime), 'EEE HH:mm', { locale: es })}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                                {e.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.description}</div>}
                            </div>
                            <span className={`badge ${e.category === 'shared' ? 'badge-green' : 'badge-yellow'}`}>
                                {e.category === 'shared' ? t('calendar.category.shared') : e.category === 'personal' ? t('calendar.category.personal') : t('calendar.category.reminder')}
                            </span>
                            <button className="btn-icon touch-target" onClick={() => setConfirmDeleteId(e.id)} style={{ color: 'var(--red)' }} aria-label={t('common.delete')}>✕</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                title={t('common.delete')}
                message={t('calendar.deleteConfirm')}
                onConfirm={handleDeleteEvent}
                onCancel={() => setConfirmDeleteId(null)}
                isDanger
            />

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{editing ? t('calendar.editEvent') : t('calendar.newEvent')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="label" htmlFor="event-title">{t('common.title')}</label>
                                <input id="event-title" className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
                            </div>
                            <div className="form-group field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="label">Inicio</label>
                                    <input id="event-start" type="datetime-local" className="input" value={form.start_datetime} onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="label">Fin</label>
                                    <input id="event-end" type="datetime-local" className="input" value={form.end_datetime} onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">Categoría</label>
                                <select id="event-category" className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}>
                                    <option value="shared">{t('calendar.category.shared')}</option>
                                    <option value="personal">{t('calendar.category.personal')}</option>
                                    <option value="reminder">{t('calendar.category.reminder')}</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Descripción (opcional)</label>
                                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {editing && (
                                <button className="btn btn-danger btn-sm touch-target" onClick={() => setConfirmDeleteId(editing.id)}>{t('common.delete')}</button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                            <button id="event-save" className="btn btn-primary" onClick={save}>{t('common.save')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
