import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import './FAB.css';

export default function FAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show FAB on auth or admin pages
  if (['/login', '/admin'].includes(location.pathname)) return null;

  return (
    <div className={`fab-container ${open ? 'fab-open' : ''}`}>
      {open && (
        <div className="fab-menu">
          <button className="fab-item touch-target" onClick={() => { navigate('/shopping'); setOpen(false); }}>
            <span className="fab-label">{t('fab.newPurchase')}</span>
            <div className="fab-icon-small">🛒</div>
          </button>
          <button className="fab-item touch-target" onClick={() => { navigate('/calendar'); setOpen(false); }}>
            <span className="fab-label">{t('fab.newEvent')}</span>
            <div className="fab-icon-small">📅</div>
          </button>
          <button className="fab-item touch-target" onClick={() => { navigate('/chores'); setOpen(false); }}>
            <span className="fab-label">{t('fab.newTask')}</span>
            <div className="fab-icon-small">✅</div>
          </button>
        </div>
      )}
      <button 
        className="fab-button touch-target" 
        onClick={() => setOpen(!open)} 
        aria-label={t('common.add')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={open ? 'rotated' : ''}>
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      {/* Backdrop to close menu when clicking outside */}
      {open && <div className="fab-backdrop" onClick={() => setOpen(false)}></div>}
    </div>
  );
}
