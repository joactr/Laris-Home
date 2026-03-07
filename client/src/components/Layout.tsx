import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

import { t } from '../i18n';
import MobileHeader from './MobileHeader';

const NAV_ITEMS = [
    { path: '/', label: 'nav.dashboard', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12L12 3l9 9" /><path d="M9 21V12h6v9" /></svg> },
    { path: '/shopping', label: 'nav.shopping', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg> },
    { path: '/calendar', label: 'nav.calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
    { path: '/chores', label: 'nav.chores', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg> },
    { path: '/meals', label: 'nav.meals', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg> },
    { path: '/recipes', label: 'nav.recipes', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
    { path: '/projects', label: 'nav.projects', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg> },
];

export default function Layout({ children }: { children: React.ReactNode }) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuthStore(); // admin is in Header

    const isActive = (path: string) =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

    const currentNavItem = NAV_ITEMS.find(item => isActive(item.path));
    const title = currentNavItem ? t(currentNavItem.label) : (isActive('/admin') ? 'Admin' : 'Laris Home');

    return (
        <div className="app-shell">
            {/* Drawer Overlay for mobile */}
            {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} />}
            
            <nav className={`sidebar-nav ${isDrawerOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    🏠 <span>Laris Home</span>
                </div>
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.path}
                        className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => { navigate(item.path); setIsDrawerOpen(false); }}
                        id={`nav-${item.label.split('.')[1]}`}
                    >
                        {item.icon}
                        <span>{t(item.label)}</span>
                    </button>
                ))}
                
                <button
                    className="nav-item sidebar-logout"
                    onClick={logout}
                    title={t('nav.logout')}
                    id="nav-logout"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    <span>{t('nav.logout')}</span>
                </button>
            </nav>

            <div className="content-wrapper">
                <MobileHeader title={title} onMenuClick={() => setIsDrawerOpen(true)} />
                <main className="page-container">{children}</main>
            </div>
        </div>
    );
}
