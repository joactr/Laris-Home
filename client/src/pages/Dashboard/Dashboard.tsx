import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { useOfflineStore } from '../../store/offline';
import { toastError } from '../../store/toast';
import Icon from '../../components/Icon';
import { t } from '../../i18n';
import { dateFormats, dateLocale } from '../../i18n/date';
import type { DashboardPayload, DashboardSummary } from '../../../../shared/contracts';
import './Dashboard.css';

const QUICK_ACTIONS = [
  { path: '/shopping', key: 'dash.quickShopping' },
  { path: '/calendar', key: 'dash.quickAgenda' },
  { path: '/meals', key: 'dash.quickMeals' },
  { path: '/recipes', key: 'dash.quickRecipes' },
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
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

  const todayAgendaCount = events.length + chores.length;
  const attentionCount = attentionItems.length + overdueTasks.length;
  const shoppingPending = data?.stats?.shoppingPending ?? 0;

  const showSummarySkeleton = (loading || (summaryLoading && !summary?.text)) && !error;
  const summaryText = error
    ? t('dash.summaryError')
    : summary?.text || t('dash.summaryFallback');

  return (
    <div className="page today-page">
      <header className="today-head">
        <h1 className="today-title">{`${t(getGreetingKey())}, ${user?.name ?? ''}`}</h1>
        <p className="today-date">{todayLabel}</p>
      </header>

      <section className="today-summary" aria-live="polite">
        {showSummarySkeleton ? (
          <div className="today-skeleton today-summary-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p>{summaryText}</p>
        )}
        {summary?.status === 'pending' && !isOffline ? (
          <p className="today-summary-status">
            {summaryLoading ? t('dash.refining') : t('dash.preparing')}
          </p>
        ) : null}
        {isOffline || pendingCount > 0 ? (
          <p className="today-sync-line">
            {isOffline ? t('dash.offline') : ''}
            {pendingCount > 0 ? t(pendingCount === 1 ? 'dash.pendingOne' : 'dash.pendingMany', pendingCount) : null}
          </p>
        ) : null}
      </section>

      <nav className="today-actions" aria-label={t('dash.quickActions')}>
        {QUICK_ACTIONS.map((action, index) => (
          <button
            key={action.path}
            type="button"
            className={`btn ${index === 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => navigate(action.path)}
          >
            {t(action.key)}
          </button>
        ))}
      </nav>

      {error && !data && !loading ? (
        <div className="today-error" role="alert">
          <p>{t('dash.loadError')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void loadDashboard()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {(data || loading) && !(error && !data) ? (
        <div className="today-grid">
          <div className="today-main">
            <section className="today-block" aria-labelledby="today-agenda-title">
              <h2 id="today-agenda-title">
                {t('dash.today')}{' '}<span className="today-count">{t(todayAgendaCount === 1 ? 'dash.itemsOne' : 'dash.itemsMany', todayAgendaCount)}</span>
              </h2>
              {loading && !data ? (
                <div className="today-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : todayAgendaCount > 0 ? (
                <ul className="today-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button type="button" className="today-row" onClick={() => navigate('/calendar')}>
                        <span className="today-time">{format(new Date(event.start_datetime), 'HH:mm')}</span>
                        <span className="today-row-main">
                          <span className="today-row-title">{event.title}</span>
                          <span className="today-row-sub">
                            {event.assigned_name ? t('dash.with', event.assigned_name) : t('dash.sharedEvent')}
                          </span>
                        </span>
                        <Icon name="chevronRight" size={16} className="today-row-chevron" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {chores.map((chore) => (
                    <li key={chore.id}>
                      <button type="button" className="today-row" onClick={() => navigate('/calendar')}>
                        <span className="today-row-main">
                          <span className="today-row-title">{chore.title}</span>
                          <span className="today-row-sub">
                            {chore.assigned_name ? t('dash.with', chore.assigned_name) : chore.location || t('dash.homeChore')}
                          </span>
                        </span>
                        <span className={`status-badge ${chore.status === 'done' ? 'done' : 'pending'}`}>
                          {chore.status === 'done' ? t('dash.done') : t('dash.pending')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <TodayEmpty
                  title={t('dash.agendaEmptyTitle')}
                  copy={t('dash.agendaEmptyCopy')}
                  actionLabel={t('dash.addInAgenda')}
                  onAction={() => navigate('/calendar')}
                />
              )}
            </section>

            <section className="today-block" aria-labelledby="today-attention-title">
              <h2 id="today-attention-title">
                {t('dash.attention')}{' '}<span className="today-count">{t('dash.attentionOne', attentionCount)}</span>
              </h2>
              {loading && !data ? (
                <div className="today-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : attentionCount > 0 ? (
                <>
                  {attentionItems.length > 0 ? (
                    <ul className="today-list">
                      {attentionItems.map((item) => (
                        <li key={item.id}>
                          <button type="button" className="today-row" onClick={() => navigate(item.path)}>
                            <span className="today-row-main">
                              <span className="today-row-title">{item.title}</span>
                              <span className="today-row-sub">{item.hint}</span>
                            </span>
                            <Icon name="chevronRight" size={16} className="today-row-chevron" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {overdueTasks.length > 0 ? (
                    <ul className="today-list">
                      {overdueTasks.map((task) => (
                        <li key={task.id}>
                          <button type="button" className="today-row" onClick={() => navigate('/projects')}>
                            <span className="today-row-main">
                              <span className="today-row-title">{task.title}</span>
                              <span className="today-row-sub">{task.project_name || t('dash.projectFallback')}</span>
                            </span>
                            <span className="today-row-side">{translatePriority(task.priority)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <p className="today-empty-title">{t('dash.calmTitle')}</p>
                  <p>{t('dash.calmCopy')}</p>
                  <div className="today-empty-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate('/meals')}>
                      {t('dash.goMeals')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/projects')}>
                      {t('dash.viewProjects')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="today-aside">
            <section className="today-block" aria-labelledby="today-meals-title">
              <h2 id="today-meals-title">
                {t('dashboard.todayMeals')}{' '}<span className="today-count">{t(mealEntries.length === 1 ? 'dash.mealsOne' : 'dash.mealsMany', mealEntries.length)}</span>
              </h2>
              {loading && !data ? (
                <div className="today-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : mealEntries.length > 0 ? (
                <ul className="today-list">
                  {mealEntries.map(([mealType, value]) => (
                    <li key={mealType} className="today-row">
                      <span className="today-row-main">
                        <span className="today-row-sub">{translateMealType(mealType)}</span>
                        <span className="today-row-title">{value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <TodayEmpty
                  title={t('dashboard.noMeals')}
                  copy={t('dash.planTodayCopy')}
                  actionLabel={t('dash.planNow')}
                  onAction={() => navigate('/meals')}
                />
              )}
              {mealEntries.length > 0 ? (
                <button type="button" className="btn btn-ghost today-block-link" onClick={() => navigate('/meals')}>
                  {t('dash.openMealPlan')}
                </button>
              ) : null}
            </section>

            <div className="today-block">
              <button type="button" className="today-row today-shopping" onClick={() => navigate('/shopping')}>
                <Icon name="cart" size={20} className="today-shopping-icon" aria-hidden="true" />
                <span className="today-row-main">
                  <span className="today-row-title">{t('nav.shopping')}</span>
                  <span className="today-row-sub">
                    {shoppingPending === 0
                      ? t('dash.nothingPending')
                      : t(shoppingPending === 1 ? 'dash.shopItemsOne' : 'dash.shopItemsMany', shoppingPending)}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} className="today-row-chevron" aria-hidden="true" />
              </button>
            </div>

            <section className="today-block" aria-labelledby="today-activity-title">
              <h2 id="today-activity-title">
                {t('dash.recentActivity')}{' '}<span className="today-count">{t(activity.length === 1 ? 'dash.movesOne' : 'dash.movesMany', activity.length)}</span>
              </h2>
              {loading && !data ? (
                <div className="today-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : activity.length > 0 ? (
                <ul className="today-list">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="today-row" onClick={() => navigate(item.path)}>
                        <span className="today-row-main">
                          <span className="today-row-title">{item.title}</span>
                          <span className="today-row-sub">{item.detail}</span>
                        </span>
                        <span className="today-row-side">{formatActivityType(item.type)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <TodayEmpty
                  title={t('dash.noActivityTitle')}
                  copy={t('dash.noActivityCopy')}
                  actionLabel={t('dash.createInAgenda')}
                  onAction={() => navigate('/calendar')}
                />
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TodayEmpty({
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
    <div className="empty-state">
      <p className="today-empty-title">{title}</p>
      <p>{copy}</p>
      <div className="today-empty-actions">
        <button type="button" className="btn btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
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

function translatePriority(value?: string | null) {
  switch (value) {
    case 'high':
      return t('dash.priorityHigh');
    case 'medium':
      return t('dash.priorityMedium');
    case 'low':
      return t('dash.priorityLow');
    default:
      return value || t('dash.priorityNone');
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

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.greeting.morning';
  if (h < 18) return 'dashboard.greeting.afternoon';
  return 'dashboard.greeting.evening';
}
