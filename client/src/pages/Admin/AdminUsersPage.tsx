import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { toastError, toastSuccess } from '../../store/toast';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';

export default function AdminUsersPage() {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [pwUserId, setPwUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === pwUserId) || null,
    [users, pwUserId]
  );

  useEffect(() => {
    if (user?.is_admin) {
      void loadUsers();
    }
  }, [user]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await api.auth.getUsers();
      setUsers(data);
    } catch (err: any) {
      toastError('No se pudieron cargar los usuarios', err?.message || 'Vuelve a intentarlo.');
    } finally {
      setUsersLoading(false);
    }
  }

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !username.trim() || password.length < 6) {
      setFormError('Nombre, usuario y una contraseña de al menos 6 caracteres son obligatorios.');
      return;
    }

    setLoading(true);
    try {
      await api.auth.register(name.trim(), username.trim(), password);
      toastSuccess('Usuario creado', `${username} ya está disponible en la casa.`);
      setName('');
      setUsername('');
      setPassword('');
      await loadUsers();
    } catch (err: any) {
      const message = err?.message || 'No se pudo crear el usuario.';
      setFormError(message);
      toastError('No se pudo crear el usuario', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (!pwUserId || newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.auth.changePassword(pwUserId, newPassword);
      toastSuccess('Contraseña actualizada', `Se cambió la clave de ${selectedUser?.username || 'este usuario'}.`);
      setPwUserId(null);
      setNewPassword('');
    } catch (err: any) {
      const message = err?.message || 'No se pudo cambiar la contraseña.';
      setPasswordError(message);
      toastError('No se pudo cambiar la contraseña', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-admin-users">
      <SectionHeader
        eyebrow="Administración"
        title="Usuarios del hogar"
        subtitle="Alta de usuarios, revisión rápida del equipo y cambio de contraseña sin salir de la app."
      />

      <div className="admin-grid">
        <Surface
          title="Crear usuario"
          subtitle="Alta rápida para una nueva persona del hogar"
        >
          <form onSubmit={handleCreateUser} className="admin-form">
            <div className="field-grid two">
              <div className="form-group">
                <label className="label">Nombre</label>
                <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="label">Usuario</label>
                <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Contraseña inicial</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <p className="field-help">Usa al menos 6 caracteres. Luego podrá cambiarla desde aquí.</p>
            </div>

            {formError ? <p className="form-error-inline">{formError}</p> : null}

            <div className="surface-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Surface>

        <Surface
          title="Usuarios existentes"
          subtitle={`${users.length} usuario${users.length === 1 ? '' : 's'} en la casa`}
        >
          {usersLoading ? (
            <div className="loading-center small">
              <div className="spinner" />
            </div>
          ) : users.length ? (
            <div className="admin-user-list">
              {users.map((member) => (
                <div key={member.id} className="admin-user-card">
                  <div className="admin-user-copy">
                    <div className="row-inline-meta">
                      <strong>{member.username}</strong>
                      {member.is_admin ? <span className="status-badge done">admin</span> : null}
                    </div>
                    <p>{member.name}</p>
                  </div>
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => setPwUserId(member.id)}>
                    Cambiar clave
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-panel left">
              <strong>Todavía no hay usuarios adicionales</strong>
              <p>Crea el primer usuario secundario para repartir tareas, agenda y compras.</p>
            </div>
          )}
        </Surface>
      </div>

      <Surface
        title={selectedUser ? `Nueva contraseña para ${selectedUser.username}` : 'Cambio de contraseña'}
        subtitle={selectedUser ? 'Actualiza la clave de acceso desde aquí.' : 'Selecciona un usuario para actualizar su acceso.'}
        className="admin-password-surface"
      >
        {selectedUser ? (
          <form onSubmit={handleChangePassword} className="admin-form inline">
            <div className="field-grid two">
              <div className="form-group">
                <label className="label">Nueva contraseña</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="label">Usuario</label>
                <input className="input" type="text" value={selectedUser.username} disabled />
              </div>
            </div>

            {passwordError ? <p className="form-error-inline">{passwordError}</p> : null}

            <div className="surface-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Confirmar cambio
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setPwUserId(null);
                  setNewPassword('');
                  setPasswordError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state-panel left">
            <strong>Elige un usuario de la lista</strong>
            <p>Desde ahí podrás actualizar la contraseña sin abandonar este panel.</p>
          </div>
        )}
      </Surface>
    </div>
  );
}
