import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_NAV_ITEMS } from './navigation';
import { t } from '../i18n';
import { useAuthStore } from '../store/auth';
import { requestPwaRefresh, usePwaStore } from '../store/pwa';

const PRIMARY_MOBILE_ITEMS = APP_NAV_ITEMS.slice(0, 4);
const SECONDARY_ITEMS = APP_NAV_ITEMS.slice(4);

function isActivePath(currentPath: string, path: string) {
  return path === '/' ? currentPath === '/' : currentPath.startsWith(path);
}

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  const moreIsActive = useMemo(
    () =>
      SECONDARY_ITEMS.some((item) => isActivePath(location.pathname, item.path)) ||
      location.pathname.startsWith('/admin'),
    [location.pathname]
  );

  return (
    <>
      {isMoreOpen ? <div className="bottom-sheet-backdrop" onClick={() => setIsMoreOpen(false)} /> : null}

      <nav className="bottom-nav mobile-only" aria-label="Navegación principal">
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <button
              key={item.path}
              type="button"
              className={`bottom-nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={t(item.label)}
              title={t(item.label)}
            >
              {item.icon}
              <span>{item.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`bottom-nav-item ${moreIsActive || isMoreOpen ? 'active' : ''}`}
          onClick={() => setIsMoreOpen((current) => !current)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="19" cy="12" r="1.4" />
          </svg>
          <span>Más</span>
        </button>
      </nav>

      <div className={`bottom-sheet ${isMoreOpen ? 'open' : ''}`}>
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-grid">
          {SECONDARY_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`menu-tile ${isActivePath(location.pathname, item.path) ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                setIsMoreOpen(false);
              }}
            >
              <span className="menu-tile-icon">{item.icon}</span>
              <span>{t(item.label)}</span>
            </button>
          ))}

          {user?.is_admin ? (
            <button
              type="button"
              className={`menu-tile ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
              onClick={() => {
                navigate('/admin');
                setIsMoreOpen(false);
              }}
            >
              <span className="menu-tile-icon">⚙</span>
              <span>Admin</span>
            </button>
          ) : null}
        </div>

        <div className="bottom-sheet-footer">
          <button
            type="button"
            className={`menu-tile menu-tile-update ${updateAvailable ? 'active' : ''}`}
            onClick={() => {
              setIsMoreOpen(false);
              void requestPwaRefresh();
            }}
          >
            <span className="menu-tile-icon">{updateAvailable ? '↻' : '⟳'}</span>
            <span>{updateAvailable ? 'Actualizar app' : 'Recargar app'}</span>
          </button>

          <button
            type="button"
            className="menu-tile menu-tile-logout"
            onClick={() => {
              setIsMoreOpen(false);
              logout();
            }}
          >
            <span className="menu-tile-icon">↗</span>
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </div>
    </>
  );
}
