import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useOfflineStore } from '../store/offline';
import { t } from '../i18n';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import VoiceAssistantUI from './VoiceAssistantUI';
import { APP_NAV_ITEMS } from './navigation';
import ToastViewport from './ToastViewport';
import { api } from '../api';

function isActivePath(currentPath: string, path: string) {
  return path === '/' ? currentPath === '/' : currentPath.startsWith(path);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const [syncFailures, setSyncFailures] = useState<Awaited<ReturnType<typeof api.offline.listFailures>> | null>(null);

  const activeItem = useMemo(
    () => APP_NAV_ITEMS.find((item) => isActivePath(location.pathname, item.path)),
    [location.pathname]
  );

  const currentTitle = activeItem ? t(activeItem.label) : location.pathname.startsWith('/admin') ? 'Admin' : 'Laris Home';
  const failedSyncEntries = syncFailures
    ? [
      ...syncFailures.shopping.map((entry: any) => ({ kind: 'shopping' as const, entry })),
      ...syncFailures.mutations.map((entry: any) => ({ kind: 'mutation' as const, entry })),
    ]
    : [];
  const openSyncFailures = async () => {
    setSyncFailures(await api.offline.listFailures());
  };

  return (
    <div className="app-shell">
      <aside className="sidebar-nav">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">LH</div>
          <div>
            <div className="sidebar-brand-name">Laris Home</div>
            <div className="sidebar-brand-note">Casa compartida, sin ruido</div>
          </div>
        </div>

        <div className="sidebar-section-label">Navegación</div>

        <div className="sidebar-nav-items">
          {APP_NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`nav-item ${isActivePath(location.pathname, item.path) ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
              }}
            >
              {item.icon}
              <span>{t(item.label)}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          {(isOffline || pendingCount > 0) && (
            <div className="sidebar-status">
              <span className={`status-dot ${isOffline ? 'offline' : 'syncing'}`} />
              <div>
                <strong>{isOffline ? 'Sin conexión' : 'Sincronizando'}</strong>
                <p>
                  {pendingCount > 0
                    ? `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`
                    : 'Todo al día'}
                </p>
              </div>
            </div>
          )}

          <button type="button" className="nav-item sidebar-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 17 15 12 10 7" />
              <path d="M15 12H3" />
              <path d="M10 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
            </svg>
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      <div className="content-wrapper">
        <TopBar title={currentTitle} />

        {(isOffline || pendingCount > 0) && (
          <button type="button" className="sync-banner sync-banner-button" onClick={openSyncFailures}>
            <span className={`status-dot ${isOffline ? 'offline' : 'syncing'}`} />
            <span>
              {isOffline
                ? 'Trabajando sin conexión. Los cambios se guardarán para sincronizar después.'
                : `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} sincronizándose`}
            </span>
          </button>
        )}

        <main className="page-container">{children}</main>
      </div>

      <BottomNav />
      <VoiceAssistantUI />
      <ToastViewport />
      {syncFailures ? (
        <div className="modal-overlay" onClick={() => setSyncFailures(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Sincronización</span>
              <button className="modal-close touch-target" onClick={() => setSyncFailures(null)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {failedSyncEntries.length === 0 ? (
                <p className="empty-state compact">No hay errores de sincronización pendientes.</p>
              ) : (
                <div className="modal-stack">
                  {failedSyncEntries.map(({ kind, entry }) => (
                    <div key={entry.id} className="list-row">
                      <div>
                        <strong>{kind === 'shopping' ? 'Compra' : entry.resource}</strong>
                        <p>{entry.lastError || 'No se pudo sincronizar este cambio.'}</p>
                      </div>
                      <div className="surface-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void api.offline.retry(kind, entry.id).then(openSyncFailures)}>
                          Reintentar
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void api.offline.discard(kind, entry.id).then(openSyncFailures)}>
                          Descartar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
