import type { ReactNode } from 'react';
import { useAuthStore } from '../store/auth';

type TopBarProps = {
  title: string;
  /** Slot para acciones de página (p. ej. el botón de voz). */
  actions?: ReactNode;
};

export default function TopBar({ title, actions }: TopBarProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">{title}</div>
      </div>

      <div className="topbar-right">
        {actions}
        <div
          className="topbar-avatar"
          style={user?.color ? { background: user.color } : undefined}
          title={user?.name || user?.username}
        >
          {(user?.name || user?.username || '?').slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
