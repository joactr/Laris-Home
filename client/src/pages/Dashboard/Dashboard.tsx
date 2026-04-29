import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { useOfflineStore } from '../../store/offline';
import { toastError } from '../../store/toast';
import CollapsiblePanel from '../../components/CollapsiblePanel';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import type { DashboardPayload, DashboardSummary } from '../../../../shared/contracts';

const QUICK_ACTIONS = [
  { path: '/shopping', label: 'Añadir compra', hint: 'Ve a la lista activa y apunta lo que falta.' },
  { path: '/calendar', label: 'Abrir agenda', hint: 'Revisa hoy y crea eventos o tareas desde una sola vista.' },
  { path: '/meals', label: 'Planificar comida', hint: 'Completa el día o la semana sin salir del flujo.' },
  { path: '/recipes', label: 'Buscar receta', hint: 'Encuentra una receta o importa una nueva.' },
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<string | null>(() => {
    if (typeof window === 'undefined') return 'attention';
    return window.localStorage.getItem('dashboard:open-panel') || 'attention';
  });
  const user = useAuthStore((s) => s.user);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (openPanel) {
      window.localStorage.setItem('dashboard:open-panel', openPanel);
    } else {
      window.localStorage.removeItem('dashboard:open-panel');
    }
  }, [openPanel]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextData = await api.dashboard.get();
        if (!active) return;
        setData(nextData);
        setError(null);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'No se pudo cargar el resumen de hoy.';
        setError(message);
        toastError('No se pudo cargar la home', message);
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
  }, []);

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
        text: 'Sin conexión. El resumen inteligente aparecerá cuando la app vuelva a sincronizar.',
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
    () => format(new Date(), "EEEE, d 'de' MMMM", { locale: es }),
    []
  );

  const mealEntries = Object.entries(data?.meals || {});
  const stats = [
    { label: 'Eventos hoy', value: data?.stats?.events ?? 0 },
    { label: 'Tareas casa', value: data?.stats?.chores ?? 0 },
    { label: 'Compra pendiente', value: data?.stats?.shoppingPending ?? 0 },
    { label: 'Proyectos atrasados', value: data?.stats?.overdueTasks ?? 0 },
  ];

  const togglePanel = (panelId: string) => {
    setOpenPanel((current) => (current === panelId ? null : panelId));
  };

  const todayAgendaCount = (data?.events?.length || 0) + (data?.chores?.length || 0);

  return (
    <div className="page page-dashboard">
      <SectionHeader
        eyebrow="Entrada diaria"
        title={`${getGreeting()}, ${user?.name ?? ''}`}
        subtitle={todayLabel}
      />

      <Surface className="dashboard-summary-surface">
        <div className="dashboard-summary-shell">
          <div className="dashboard-summary-copy">
            <span className="summary-pill">
              {summary?.mode === 'ai' ? 'Resumen inteligente' : 'Resumen del día'}
            </span>
            <h2>Lo importante al entrar</h2>
            {(loading || (summaryLoading && !summary?.text)) && !error ? (
              <div className="summary-skeleton">
                <span className="summary-skeleton-line wide" />
                <span className="summary-skeleton-line" />
                <span className="summary-skeleton-line short" />
              </div>
            ) : (
              <p>
                {error
                  ? 'No he podido montar el resumen completo. Aun así puedes entrar directamente a agenda, compra o comidas.'
                  : summary?.text || 'Hoy está despejado. Puedes aprovechar para planificar comidas, revisar la compra o adelantar tareas.'}
              </p>
            )}
            {summary?.status === 'pending' && !isOffline ? (
              <div className="summary-loading-state" aria-live="polite">
                <div className="summary-loading-bar" />
                <span>{summaryLoading ? 'La IA está refinando el resumen con los cambios del día…' : 'Preparando resumen inteligente…'}</span>
              </div>
            ) : null}
            <div className="dashboard-summary-meta">
              {isOffline ? <span>Modo sin conexión activo</span> : <span>Datos del hogar en tiempo real</span>}
              {pendingCount > 0 ? <span>{pendingCount} cambio{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}</span> : null}
            </div>
          </div>

          <div className="dashboard-stat-grid">
            {stats.map((item) => (
              <div key={item.label} className="dashboard-stat-card">
                <strong>{loading ? '...' : item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <div className="dashboard-quick-grid">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.path}
            type="button"
            className="dashboard-quick-card"
            onClick={() => navigate(action.path)}
          >
            <strong>{action.label}</strong>
            <span>{action.hint}</span>
          </button>
        ))}
      </div>

      <div className="dashboard-panel-stack">
        <CollapsiblePanel
          id="dashboard-attention-panel"
          title="Requiere atención"
          subtitle="Siguientes pasos claros para no perder tiempo"
          open={openPanel === 'attention'}
          onToggle={() => togglePanel('attention')}
          summary={
            <DashboardPanelSummary
              primary={`${data?.attention_items?.length || 0} pendientes`}
              secondary={(data?.attention_items?.[0]?.title || '').slice(0, 42)}
            />
          }
        >
          {loading && !data ? (
            <div className="dashboard-activity-list">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="activity-row static skeleton-row" />
              ))}
            </div>
          ) : data?.attention_items?.length ? (
            <div className="dashboard-action-list">
              {data.attention_items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`attention-row ${item.tone || 'info'}`}
                  onClick={() => navigate(item.path)}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.hint}</p>
                  </div>
                  <span>Abrir</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPrompt
              title="Nada urgente ahora mismo"
              copy="La casa está tranquila. Puedes usar este momento para planificar comidas o limpiar tu lista de compra."
              actionLabel="Ir a comidas"
              onAction={() => navigate('/meals')}
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          id="dashboard-activity-panel"
          title="Actividad reciente"
          subtitle="Próximos eventos, compra pendiente y señales útiles"
          open={openPanel === 'activity'}
          onToggle={() => togglePanel('activity')}
          summary={
            <DashboardPanelSummary
              primary={`${data?.activity?.length || 0} movimientos`}
              secondary={data?.activity?.[0]?.detail || 'Sin novedades importantes'}
            />
          }
        >
          {loading && !data ? (
            <div className="dashboard-activity-list">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="activity-row static skeleton-row" />
              ))}
            </div>
          ) : data?.activity?.length ? (
            <div className="dashboard-activity-list">
              {data.activity.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="activity-row"
                  onClick={() => navigate(item.path)}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span>{formatActivityType(item.type)}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPrompt
              title="Sin actividad destacada"
              copy="Todavía no hay nada reciente que revisar. Puedes crear un evento o una tarea desde la agenda."
              actionLabel="Crear en agenda"
              onAction={() => navigate('/calendar')}
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          id="dashboard-meals-panel"
          title="Comidas de hoy"
          subtitle="Lo que ya está previsto"
          open={openPanel === 'meals'}
          onToggle={() => togglePanel('meals')}
          summary={
            <DashboardPanelSummary
              primary={`${mealEntries.length} bloques`}
              secondary={mealEntries.length ? mealEntries.map(([mealType]) => translateMealType(mealType)).join(' · ') : 'Sin plan todavía'}
            />
          }
        >
          {loading && !data ? (
            <div className="stack-list">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="list-row skeleton-row" />
              ))}
            </div>
          ) : mealEntries.length ? (
            <div className="stack-list">
              {mealEntries.map(([mealType, value]) => (
                <div key={mealType} className="list-row">
                  <span>{translateMealType(mealType)}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPrompt
              title="No hay comidas planificadas"
              copy="Planifica al menos el día de hoy para no tener que improvisar más tarde."
              actionLabel="Planificar ahora"
              onAction={() => navigate('/meals')}
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          id="dashboard-agenda-panel"
          title="Agenda de hoy"
          subtitle="Eventos y tareas domésticas visibles al entrar"
          open={openPanel === 'agenda'}
          onToggle={() => togglePanel('agenda')}
          summary={
            <DashboardPanelSummary
              primary={`${todayAgendaCount} elementos`}
              secondary={todayAgendaCount ? `${data?.events?.length || 0} eventos · ${data?.chores?.length || 0} tareas` : 'Día despejado'}
            />
          }
        >
          {loading && !data ? (
            <div className="stack-list">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="agenda-row skeleton-row" />
              ))}
            </div>
          ) : (data?.events?.length || data?.chores?.length) ? (
            <div className="stack-list">
              {(data?.events || []).slice(0, 3).map((event) => (
                <div key={event.id} className="agenda-row">
                  <div className="agenda-row-time">{format(new Date(event.start_datetime), 'HH:mm')}</div>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.assigned_name ? `Con ${event.assigned_name}` : 'Evento compartido'}</p>
                  </div>
                </div>
              ))}
              {(data?.chores || []).slice(0, 3).map((chore) => (
                <div key={chore.id} className="list-row">
                  <div>
                    <strong>{chore.title}</strong>
                    <p className="muted-inline">{chore.location || 'Tarea del hogar'}</p>
                  </div>
                  <span className={`status-badge ${chore.status}`}>{chore.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPrompt
              title="Hoy está despejado"
              copy="No hay eventos ni tareas del hogar para hoy. Si quieres, bloquea tiempo o crea una rutina rápida."
              actionLabel="Añadir en agenda"
              onAction={() => navigate('/calendar')}
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          id="dashboard-projects-panel"
          title="Proyectos atrasados"
          subtitle="Lo que se está quedando atrás"
          className={data?.overdue_tasks?.length ? 'surface-danger' : ''}
          open={openPanel === 'projects'}
          onToggle={() => togglePanel('projects')}
          summary={
            <DashboardPanelSummary
              primary={`${data?.overdue_tasks?.length || 0} atrasadas`}
              secondary={data?.overdue_tasks?.[0]?.project_name || 'Sin bloqueos ahora mismo'}
            />
          }
        >
          {loading && !data ? (
            <div className="stack-list">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="list-row skeleton-row" />
              ))}
            </div>
          ) : data?.overdue_tasks?.length ? (
            <div className="stack-list">
              {data.overdue_tasks.slice(0, 4).map((task) => (
                <div key={task.id} className="list-row">
                  <div>
                    <strong>{task.title}</strong>
                    <p className="muted-inline">{task.project_name}</p>
                  </div>
                  <span className={`priority-badge priority-${task.priority}`}>{task.priority}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPrompt
              title="Nada atrasado en proyectos"
              copy="No hay tareas vencidas. Buen momento para revisar próximas entregas o simplemente dejarlo estar."
              actionLabel="Ver proyectos"
              onAction={() => navigate('/projects')}
            />
          )}
        </CollapsiblePanel>
      </div>
    </div>
  );
}

function DashboardPanelSummary({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <>
      <span className="compact-summary-pill">{primary}</span>
      {secondary ? <span className="compact-summary-note">{secondary}</span> : null}
    </>
  );
}

function EmptyPrompt({
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
    <div className="empty-state-panel">
      <strong>{title}</strong>
      <p>{copy}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function translateMealType(value: string) {
  switch (value) {
    case 'breakfast':
      return 'Desayuno';
    case 'lunch':
      return 'Comida';
    case 'dinner':
      return 'Cena';
    case 'snack':
      return 'Snack';
    default:
      return value;
  }
}

function formatActivityType(type: string) {
  switch (type) {
    case 'event':
      return 'Agenda';
    case 'shopping':
      return 'Compra';
    default:
      return 'Actividad';
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}
