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
      <SectionHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
      />

      <Surface title={t('admin.createUser')}>
        <form onSubmit={handleCreateUser} className="admin-form">
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
            <p className="field-help">{t('admin.minChars', MIN_PASSWORD_LENGTH)}</p>
          </div>

          {formError ? <p className="form-error-inline">{formError}</p> : null}

          <div className="surface-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('admin.creating') : t('admin.createUser')}
            </button>
          </div>
        </form>
      </Surface>

      <Surface
        title={t('admin.users')}
        subtitle={t(users.length === 1 ? 'admin.accountsOne' : 'admin.accountsMany', users.length)}
      >
        {usersLoading ? (
          <div className="loading-center small">
            <div className="spinner" />
          </div>
        ) : users.length ? (
          <ul className="admin-list">
            {users.map((member) => (
              <li key={member.id} className="admin-row">
                <span className="admin-avatar" style={{ background: member.color }} aria-hidden="true">
                  {(member.name?.trim() || member.username?.trim() || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="admin-copy">
                  <strong>{member.name}</strong>
                  <span>{member.username} · {member.role === 'admin' || member.is_admin ? t('admin.adminRole') : t('admin.memberRole')}</span>
                </div>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => openPasswordModal(member.id)}>
                  {t('admin.changePassword')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">{t('admin.noUsers')}</p>
        )}
      </Surface>

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
                  placeholder={t('admin.minPasswordPlaceholder', MIN_PASSWORD_LENGTH)}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoFocus
                />
              </div>

              {passwordError ? <p className="form-error-inline">{passwordError}</p> : null}

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
