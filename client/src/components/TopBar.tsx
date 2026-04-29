import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

type TopBarProps = {
  title: string;
};

export default function TopBar({ title }: TopBarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div>
          <div className="topbar-kicker">Laris Home</div>
          <h1 className="topbar-title">{title}</h1>
        </div>
      </div>

      <div className="topbar-right">
        {user?.is_admin ? (
          <button type="button" className="topbar-chip" onClick={() => navigate('/admin')}>
            Admin
          </button>
        ) : null}
        <div className="topbar-avatar" title={user?.username}>
          {user?.username?.slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
