import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import './MobileHeader.css';

interface MobileHeaderProps {
  title?: string;
  onMenuClick?: () => void;
}

export default function MobileHeader({ title, onMenuClick }: MobileHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <header className="mobile-header">
      <div className="mobile-header-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onMenuClick && (
            <button className="header-icon-btn mobile-only" onClick={onMenuClick} aria-label="Menu">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}
          <h1 className="mobile-header-title">{title || 'Laris Home'}</h1>
        </div>
        
        <div className="mobile-header-actions">
          {user?.is_admin && (
            <button onClick={() => navigate('/admin')} className="header-icon-btn" aria-label="Admin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          )}
          <div className="user-avatar" title={user?.username}>
            {user?.username?.substring(0, 2).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
