import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { t } from '../../i18n';

export default function AuthPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.auth.login(username, password);
            setAuth(res.token, res.user);
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">🏠 Laris Home</div>
                <p className="auth-tagline">{t('auth.tagline')}</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="label">Usuario</label>
                        <input id="auth-username" className="input" type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('auth.password')}</label>
                        <input id="auth-password" className="input" type="password" placeholder={t('auth.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
                    <button id="auth-submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={loading}>
                        {loading ? t('common.loading') : t('auth.signin')}
                    </button>
                </form>
            </div>
        </div>
    );
}
