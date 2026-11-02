import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useOfflineStore } from '../store/offline';
import { t } from '../i18n';
import TopBar from './TopBar';
import BrandMark from './BrandMark';
import BottomNav from './BottomNav';
import VoiceAssistantUI from './VoiceAssistantUI';
import { APP_NAV_ITEMS } from './navigation';
import LanguageSwitch from './LanguageSwitch';
import ToastViewport from './ToastViewport';
import { api } from '../api';
import Icon from './Icon';

function isActivePath(currentPath: string, path: string) {
  return path === '/' ? currentPath === '/' : currentPath.startsWith(path);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => Boolean(s.user?.is_admin || s.user?.role === 'admin'));
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const [syncFailures, setSyncFailures] = useState<Awaited<ReturnType<typeof api.offline.listFailures>> | null>(null);

  const activeItem = useMemo(
    () => APP_NAV_ITEMS.find((item) => isActivePath(location.pathname, item.path)),
    [location.pathname]
  );

  const currentTitle = activeItem ? t(activeItem.label) : location.pathname.startsWith('/admin') ? t('shell.admin') : 'Laris Home';
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
          <span className="sidebar-brand-mark">
            <BrandMark />
          </span>
          <span className="sidebar-brand-name">Laris</span>
        </div>

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
          {isAdmin ? (
            <button
              type="button"
              className={`nav-item ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
              onClick={() => navigate('/admin')}
            >
              <Icon name="shield" />
              <span>{t('shell.admin')}</span>
            </button>
          ) : null}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" style={user?.color ? { background: user.color } : undefined} aria-hidden="true">
              {(user?.name || user?.username || '?').slice(0, 2).toUpperCase()}
            </span>
            <span className="sidebar-user-name">{user?.name || user?.username}</span>
          </div>
          <div className="sidebar-footer-row">
            <LanguageSwitch />
            <button
              type="button"
              className="icon-button sidebar-logout"
              onClick={logout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="content-wrapper">
        <TopBar title={currentTitle} actions={<VoiceAssistantUI />} />

        {(isOffline || pendingCount > 0) && (
          <button type="button" className={`sync-banner sync-banner-button ${isOffline ? 'offline' : ''}`} onClick={openSyncFailures}>
            <Icon name={isOffline ? 'warning' : 'refresh'} size={18} />
            <span>
              {isOffline
                ? t('shell.offlineBanner')
                : t(pendingCount === 1 ? 'shell.syncingOne' : 'shell.syncingMany', pendingCount)}
            </span>
          </button>
        )}

        <main className="page-container">{children}</main>
      </div>

      <BottomNav />
      <ToastViewport />
      {syncFailures ? (
        <div className="modal-overlay" onClick={() => setSyncFailures(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('shell.syncTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setSyncFailures(null)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {failedSyncEntries.length === 0 ? (
                <p className="empty-state compact">{t('shell.noSyncErrors')}</p>
              ) : (
                <div className="modal-stack">
                  {failedSyncEntries.map(({ kind, entry }) => (
                    <div key={entry.id} className="list-row">
                      <div>
                        <strong>{kind === 'shopping' ? t('shell.purchase') : entry.resource}</strong>
                        <p>{entry.lastError || t('shell.syncFailedFallback')}</p>
                      </div>
                      <div className="surface-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void api.offline.retry(kind, entry.id).then(openSyncFailures)}>
                          {t('common.retry')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void api.offline.discard(kind, entry.id).then(openSyncFailures)}>
                          {t('shell.discard')}
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
