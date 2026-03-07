import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { Navigate } from 'react-router-dom';

export default function AdminUsersPage() {
    const user = useAuthStore((s) => s.user);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const [users, setUsers] = useState<any[]>([]);
    const [pwUserId, setPwUserId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        if (user?.is_admin) {
            loadUsers();
        }
    }, [user]);

    async function loadUsers() {
        try {
            const data = await api.auth.getUsers();
            setUsers(data);
        } catch (err: any) {
            console.error(err);
        }
    }

    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    async function handleCreateUser(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            await api.auth.register(name, username, password);
            setSuccess(`User ${username} created successfully!`);
            setName('');
            setUsername('');
            setPassword('');
            loadUsers();
        } catch (err: any) {
            setError(err.message || 'Error occurred while creating user');
        } finally {
            setLoading(false);
        }
    }

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!pwUserId || !newPassword) return;
        setLoading(true);
        try {
            await api.auth.changePassword(pwUserId, newPassword);
            setSuccess('Password updated successfully!');
            setPwUserId(null);
            setNewPassword('');
        } catch (err: any) {
            setError(err.message || 'Error occurred changing password');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="admin-users-page" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <h2>Panel de Administrador</h2>
            <br />
            {error && <div style={{ color: 'red', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ color: 'green', marginBottom: '16px' }}>{success}</div>}
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '32px' }}>
                <div>
                    <h3>Crear Usuario</h3>
                    <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                        <div className="form-group">
                            <label className="label">Nombre</label>
                            <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Usuario</label>
                            <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Contraseña</label>
                            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading && !pwUserId ? 'Creando...' : 'Crear Usuario'}
                        </button>
                    </form>
                </div>

                <div>
                    <h3>Usuarios Existentes</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                        {users.map(u => (
                            <div key={u.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{u.username} {u.is_admin ? '(Admin)' : ''}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>{u.name}</div>
                                </div>
                                <button className="btn btn-outline" style={{ fontSize: '13px', padding: '6px 12px' }} onClick={() => setPwUserId(u.id)}>
                                    Cambiar Clave
                                </button>
                            </div>
                        ))}
                    </div>

                    {pwUserId && (
                        <div style={{ marginTop: '24px', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                            <h4>Nueva Contraseña para {users.find(u => u.id === pwUserId)?.username}</h4>
                            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                                <div className="form-group">
                                    <input className="input" type="password" placeholder="Nueva Contraseña" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="submit" className="btn btn-primary" disabled={loading}>Confirmar</button>
                                    <button type="button" className="btn btn-outline" onClick={() => { setPwUserId(null); setNewPassword(''); }}>Cancelar</button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
