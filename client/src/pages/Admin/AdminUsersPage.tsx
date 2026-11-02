import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { toastError, toastSuccess } from '../../store/toast';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import Icon from '../../components/Icon';
import { t } from '../../i18n';
import type { AuthUser } from '../../../../shared/contracts';
import './Admin.css';

const MIN_PASSWORD_LENGTH = 8;

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}


export default function AdminUsersPage() {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [pwUserId, setPwUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === pwUserId) || null,
    [users, pwUserId]
  );

  const isAdmin = user?.role === 'admin' || user?.is_admin === true;
  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    }
  }, [isAdmin]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await api.auth.getUsers();
      setUsers(data);
    } catch (err: unknown) {
      toastError(t('admin.loadUsersFailed'), toMessage(err, t('admin.retryLater')));
    } finally {
      setUsersLoading(false);
    }
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !username.trim() || password.length < MIN_PASSWORD_LENGTH) {
      setFormError(t('admin.formRequired', MIN_PASSWORD_LENGTH));
      return;
    }

    setLoading(true);
    try {
      await api.auth.register(name.trim(), username.trim(), password);
      toastSuccess(t('admin.userCreated'), t('admin.userCreatedMsg', username));
      setName('');
      setUsername('');
      setPassword('');
      await loadUsers();
    } catch (err: unknown) {
      const message = toMessage(err, t('admin.createFailed'));
      setFormError(message);
      toastError(t('admin.createFailed'), message);
    } finally {
      setLoading(false);
    }
  }

  function openPasswordModal(memberId: string) {
    setPwUserId(memberId);
    setNewPassword('');
    setPasswordError(null);
  }

  function closePasswordModal() {
    setPwUserId(null);
    setNewPassword('');
    setPasswordError(null);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (!pwUserId || newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t('admin.newPasswordMin', MIN_PASSWORD_LENGTH));
      return;
    }

    setLoading(true);
    try {
      await api.auth.changePassword(pwUserId, newPassword);
      toastSuccess(t('admin.passwordUpdated'), t('admin.passwordUpdatedMsg', selectedUser?.username ?? t('admin.memberRole')));
      closePasswordModal();
    } catch (err: unknown) {
      const message = toMessage(err, t('admin.passwordChangeFailed'));
      setPasswordError(message);
      toastError(t('admin.passwordChangeFailed'), message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-admin-users">
      <SectionHeader title={t('admin.title')} />

      <div className="admin-layout">

      <Surface title={t('admin.createUser')}>
        <form onSubmit={handleCreateUser}>
          <div className="field-grid two">
            <div className="form-group">
              <label className="label">{t('admin.name')}</label>
              <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">{t('admin.username')}</label>
              <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label className="label">{t('admin.initialPassword')}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} />
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="surface-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('admin.creating') : t('admin.createUser')}
            </button>
          </div>
        </form>
      </Surface>

      <Surface title={t('admin.users')}>
        {usersLoading ? (
          <div className="loading-center small">
            <div className="spinner" />
          </div>
        ) : users.length ? (
          <ul className="admin-list">
            {users.map((member) => (
              <li key={member.id} className="list-row admin-row">
                <span className="avatar" style={{ background: member.color }} aria-hidden="true">
                  {(member.name?.trim() || member.username?.trim() || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="admin-name">{member.name}</span>
                <span className="admin-username">{member.username}</span>
                {member.role === 'admin' || member.is_admin ? <span className="status-badge shared">{t('admin.adminRole')}</span> : null}
                <button
                  className="btn btn-ghost btn-icon admin-action"
                  type="button"
                  onClick={() => openPasswordModal(member.id)}
                  aria-label={t('admin.changePassword')}
                  title={t('admin.changePassword')}
                >
                  <Icon name="shield" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">{t('admin.noUsers')}</p>
        )}
      </Surface>
      </div>

      {selectedUser ? (
        <div className="modal-overlay" onClick={closePasswordModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('admin.newPasswordFor', selectedUser.username)}</span>
              <button className="modal-close" onClick={closePasswordModal} aria-label={t('common.close')}>
                <Icon name="close" size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
              <label className="label">{t('admin.newPassword')}</label>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoFocus
                />
              </div>

              {passwordError ? <p className="form-error">{passwordError}</p> : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closePasswordModal}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {t('admin.confirmChange')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
