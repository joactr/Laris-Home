import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../../api';
import SectionHeader from '../../components/SectionHeader';
import { useOfflineStore } from '../../store/offline';
import { toastError } from '../../store/toast';
import Icon from '../../components/Icon';
import { t } from '../../i18n';
import { dateFormats, dateLocale } from '../../i18n/date';
import type { DashboardPayload, DashboardSummary } from '../../../../shared/contracts';
import './Dashboard.css';

export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const navigate = useNavigate();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await api.dashboard.get();
      setData(nextData);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('dash.loadTodayFailed');
      setError(message);
      toastError(t('dash.loadHomeFailed'), message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (loading || isOffline) {
      setSummaryLoading(false);
      return;
    }

    setSummary((current) => current || {
      text: '',
      mode: 'fallback',
      status: 'pending',
      generated_at: null,
    });

    let active = true;
    let timeoutId: number | null = null;
    let attempts = 0;

    const poll = async () => {
      if (!active) return;
      attempts += 1;
      setSummaryLoading(true);

      try {
        const nextSummary = await api.dashboard.getSummary();
        if (!active) return;
        setSummary(nextSummary);

        if (nextSummary.status === 'pending' && attempts < 8) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 1400);
          return;
        }
      } catch {
        if (!active) return;
        if (attempts < 8) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 1800);
          return;
        }
      } finally {
        if (active && attempts >= 8) {
          setSummaryLoading(false);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loading, isOffline]);

  useEffect(() => {
    if (isOffline) {
      setSummary({
        text: t('dash.offlineSummary'),
        mode: 'fallback',
        status: 'ready',
        generated_at: null,
      });
      return;
    }
  }, [isOffline]);

  useEffect(() => {
    if (summary?.status === 'ready') {
      setSummaryLoading(false);
    }
  }, [summary?.status]);

  const todayLabel = useMemo(
    () => format(new Date(), dateFormats.weekdayCommaDayMonth(), { locale: dateLocale() }),
    []
  );

  const mealEntries = Object.entries(data?.meals ?? {});
  const attentionItems = data?.attention_items ?? [];
  const overdueTasks = data?.overdue_tasks ?? [];
  const activity = data?.activity ?? [];
  const chores = data?.chores ?? [];
  const events = useMemo(
    () => [...(data?.events ?? [])].sort(
      (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    ),
    [data]
  );

  const attentionCount = attentionItems.length + overdueTasks.length;
  const todayAgendaCount = events.length + chores.length;
  const shoppingPending = data?.stats?.shoppingPending ?? 0;

  const showSummarySkeleton = (loading || (summaryLoading && !summary?.text)) && !error;
  const summaryText = error
    ? t('dash.summaryError')
    : summary?.text || t('dash.summaryFallback');

  return (
    <div className="page today-page">
      <SectionHeader title={t('nav.dashboard')} />

      <section className="today-summary" aria-live="polite">
        {showSummarySkeleton ? (
          <div className="today-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : (
          <p>{summaryText}</p>
        )}
        {pendingCount > 0 ? (
          <p className="today-sync-line">
            {t(pendingCount === 1 ? 'dash.pendingOne' : 'dash.pendingMany', pendingCount)}
          </p>
        ) : null}
      </section>

      {error && !data && !loading ? (
        <div className="today-error" role="alert">
          <button type="button" className="btn btn-secondary" onClick={() => void loadDashboard()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {(data || loading) && !(error && !data) ? (
        <div className="today-grid">
          <div className="today-main">
            <section className="today-block" aria-labelledby="today-agenda-title">
              <h2 id="today-agenda-title" className="today-date">{todayLabel}</h2>
              {loading && !data ? (
                <Skeleton rows={4} />
              ) : todayAgendaCount > 0 ? (
                <ul className="today-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button type="button" className="today-row" onClick={() => navigate('/calendar')}>
                        <span className="today-lead">{format(new Date(event.start_datetime), 'HH:mm')}</span>
                        <span className="today-row-title">{event.title}</span>
                      </button>
                    </li>
                  ))}
                  {chores.map((chore) => {
                    const done = chore.status === 'done';
                    return (
                      <li key={chore.id}>
                        <button type="button" className={`today-row${done ? ' is-done' : ''}`} onClick={() => navigate('/calendar')}>
                          <span className="today-lead">
                            {done ? <Icon name="check" size={16} /> : null}
                          </span>
                          <span className="today-row-title">{chore.title}</span>
                          {chore.assigned_name ? (
                            <span
                              className="avatar"
                              role="img"
                              style={{ background: chore.assigned_color ?? undefined }}
                              title={chore.assigned_name}
                              aria-label={chore.assigned_name}
                            >
                              {chore.assigned_name.slice(0, 1).toUpperCase()}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty-state compact">{t('dash.agendaEmptyTitle')}</p>
              )}
            </section>

            <section className="today-block" aria-labelledby="today-attention-title">
              <h2 id="today-attention-title">{t('dash.attention')}</h2>
              {loading && !data ? (
                <Skeleton rows={3} />
              ) : attentionCount > 0 ? (
                <ul className="today-list">
                  {attentionItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="today-row" onClick={() => navigate(item.path)}>
                        <span className="today-row-title">{item.title}</span>
                      </button>
                    </li>
                  ))}
                  {overdueTasks.map((task) => (
                    <li key={task.id}>
                      <button type="button" className="today-row" onClick={() => navigate('/projects')}>
                        <span className="today-row-title">{task.title}</span>
                        <span className="today-row-side">
                          {[task.priority ? t(`projects.${task.priority}`) : null, task.project_name].filter(Boolean).join(', ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state compact">{t('dash.calmTitle')}</p>
              )}
            </section>
          </div>

          <div className="today-aside">
            <section className="today-block" aria-labelledby="today-meals-title">
              <h2 id="today-meals-title">{t('dash.meals')}</h2>
              {loading && !data ? (
                <Skeleton rows={3} />
              ) : mealEntries.length > 0 ? (
                <ul className="today-list">
                  {mealEntries.map(([mealType, value]) => (
                    <li key={mealType}>
                      <button type="button" className="today-row" onClick={() => navigate('/meals')}>
                        <span className="today-lead today-lead-meal">{translateMealType(mealType)}</span>
                        <span className="today-row-title">{value}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state compact">{t('dashboard.noMeals')}</p>
              )}
            </section>

            <section className="today-block" aria-labelledby="today-shopping-title">
              <h2 id="today-shopping-title">{t('nav.shopping')}</h2>
              <ul className="today-list">
                <li>
                  <button type="button" className="today-row" onClick={() => navigate('/shopping')}>
                    <span className="today-row-title">{t('shopping.filterActive')}</span>
                    <span className="today-row-side">{shoppingPending}</span>
                  </button>
                </li>
              </ul>
            </section>

            <section className="today-block" aria-labelledby="today-activity-title">
              <h2 id="today-activity-title">{t('dash.recentActivity')}</h2>
              {loading && !data ? (
                <Skeleton rows={4} />
              ) : activity.length > 0 ? (
                <ul className="today-list">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="today-row" onClick={() => navigate(item.path)}>
                        <span className="today-row-title">{item.title}</span>
                        <span className="today-row-side">{formatActivityType(item.type)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state compact">{t('dash.noActivityTitle')}</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="today-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <span key={i} />)}
    </div>
  );
}

function translateMealType(value: string) {
  switch (value) {
    case 'breakfast':
      return t('dash.mealBreakfast');
    case 'lunch':
      return t('dash.mealLunch');
    case 'dinner':
      return t('dash.mealDinner');
    case 'snack':
      return t('dash.mealSnack');
    default:
      return value;
  }
}

function formatActivityType(type: string) {
  switch (type) {
    case 'event':
      return t('dash.activityAgenda');
    case 'shopping':
      return t('dash.activityShopping');
    default:
      return t('dash.activityOther');
  }
}
