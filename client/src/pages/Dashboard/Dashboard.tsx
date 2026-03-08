import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { t } from '../../i18n';

export default function Dashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const user = useAuthStore((s) => s.user);
    const { logout } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        api.dashboard.get().then(setData).catch(() => { }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="loading-center"><div className="spinner" /></div>;

    const todayLabel = format(new Date(), 'EEEE, d MMMM', { locale: es });

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <div className="page-title">{getGreeting()}, {user?.name} 👋</div>
                    <div className="page-subtitle" style={{ textTransform: 'capitalize' }}>{todayLabel}</div>
                </div>
                <button 
                  className="btn btn-ghost btn-sm touch-target" 
                  onClick={logout} 
                  id="dashboard-logout"
                  aria-label={t('nav.logout')}
                >
                    {t('nav.logout')}
                </button>
            </div>

            <div className="dashboard-grid">
                {/* Today's Meals */}
                <div className="card">
                    <div className="dash-section-title">🍽 {t('dashboard.todayMeals')}</div>
                    {data?.meals ? (
                        <div className="dash-meals-list">
                            {data.meals.breakfast && <div className="dash-meal-item"><span className="meal-label">{t('meals.breakfast')} · </span>{data.meals.breakfast}</div>}
                            {data.meals.lunch && <div className="dash-meal-item"><span className="meal-label">{t('meals.lunch')} · </span>{data.meals.lunch}</div>}
                            {data.meals.dinner && <div className="dash-meal-item"><span className="meal-label">{t('meals.dinner')} · </span>{data.meals.dinner}</div>}
                            {data.meals.snack && <div className="dash-meal-item"><span className="meal-label">{t('meals.snack')} · </span>{data.meals.snack}</div>}
                        </div>
                    ) : <p className="empty-state" style={{ padding: '10px 0' }}>{t('dashboard.noMeals')}</p>}
                    <button className="btn btn-ghost btn-sm touch-target" style={{ marginTop: 10 }} onClick={() => navigate('/meals')}>{t('dashboard.editMeals')}</button>
                </div>

                {/* Today's Events */}
                <div className="card">
                    <div className="dash-section-title">📅 {t('dashboard.todayEvents')}</div>
                    {data?.events?.length ? data.events.map((e: any) => (
                        <div key={e.id} className="event-list-item">
                            <div className="event-time">{format(new Date(e.start_datetime), 'HH:mm')}</div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                                {e.assigned_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('dashboard.with')} {e.assigned_name}</div>}
                            </div>
                        </div>
                    )) : <p className="empty-state-sm">{t('dashboard.noEvents')}</p>}
                    <button className="btn btn-ghost btn-sm touch-target" style={{ marginTop: 10 }} onClick={() => navigate('/calendar')}>{t('dashboard.viewCalendar')}</button>
                </div>

                {/* Today's Chores */}
                <div className="card">
                    <div className="dash-section-title">🧹 {t('dashboard.todayChores')}</div>
                    {data?.chores?.length ? data.chores.map((c: any) => (
                        <div key={c.id} className="dash-chore-item">
                            <span className="chore-status-icon">{c.status === 'done' ? '✅' : c.status === 'skipped' ? '⏭' : '⬜'}</span>
                            <span className={`chore-text ${c.status === 'done' ? 'completed' : ''}`}>{c.title}</span>
                            {c.assigned_name && (
                                <span className="avatar" title={c.assigned_name} style={{ background: c.assigned_color, marginLeft: 'auto' }}>
                                    {c.assigned_name[0]}
                                </span>
                            )}
                        </div>
                    )) : <p className="empty-state-sm">{t('dashboard.noChores')}</p>}
                    <button className="btn btn-ghost btn-sm touch-target" style={{ marginTop: 10 }} onClick={() => navigate('/chores')}>{t('dashboard.manageChores')}</button>
                </div>

                {/* Overdue tasks */}
                {data?.overdue_tasks?.length > 0 && (
                    <div className="card card-danger">
                        <div className="dash-section-title danger-text">⚠ {t('dashboard.overdueTasks')}</div>
                        {data.overdue_tasks.map((t: any) => (
                            <div key={t.id} className="overdue-item">
                                <span className={`priority-badge priority-${t.priority}`}>{t.priority}</span>{' '}
                                <span className="overdue-title">{t.title}</span>
                                <span className="overdue-project">({t.project_name})</span>
                            </div>
                        ))}
                        <button className="btn btn-ghost btn-sm touch-target" style={{ marginTop: 10 }} onClick={() => navigate('/projects')}>{t('dashboard.viewProjects')}</button>
                    </div>
                )}
            </div>
        </div>
    );
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greeting.morning');
    if (h < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
}
