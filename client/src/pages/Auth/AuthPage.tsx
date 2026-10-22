import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import BrandMark from '../../components/BrandMark';
import LanguageSwitch from '../../components/LanguageSwitch';
import { t } from '../../i18n';

export default function AuthPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [needsBootstrap, setNeedsBootstrap] = useState(false);
    const [bootstrapName, setBootstrapName] = useState('');
    const [bootstrapUsername, setBootstrapUsername] = useState('');
    const [bootstrapPassword, setBootstrapPassword] = useState('');
    const [bootstrapError, setBootstrapError] = useState('');
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);

    useEffect(() => {
        let cancelled = false;
        api.auth.getBootstrapStatus()
            .then((res) => {
                if (!cancelled && res.needsBootstrap) setNeedsBootstrap(true);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.auth.login(username, password);
            setAuth(res.token, res.user);
            navigate('/');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleBootstrap(e: React.FormEvent) {
        e.preventDefault();
        setBootstrapError('');
        setBootstrapLoading(true);
        try {
            await api.auth.registerFirstAdmin(bootstrapName, bootstrapUsername, bootstrapPassword);
            const res = await api.auth.login(bootstrapUsername, bootstrapPassword);
            setAuth(res.token, res.user);
            navigate('/');
        } catch (err: unknown) {
            setBootstrapError(err instanceof Error ? err.message : String(err));
        } finally {
            setBootstrapLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-lang"><LanguageSwitch /></div>
            <div className="auth-card">
                <div className="auth-logo">
                    <span className="auth-logo-mark"><BrandMark /></span>
                    Laris
                </div>
                <h1 className="auth-title">{needsBootstrap ? t('auth.createAccount') : t('auth.signin')}</h1>
                <p className="auth-tagline">{needsBootstrap ? t('shell.bootstrapHint') : t('auth.tagline')}</p>
                {needsBootstrap ? (
                    <form onSubmit={handleBootstrap}>
                        <div className="form-group">
                            <label className="label" htmlFor="bootstrap-name">{t('auth.name')}</label>
                            <input id="bootstrap-name" className="input" type="text" autoComplete="name" value={bootstrapName} onChange={(e) => setBootstrapName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="bootstrap-username">{t('auth.username')}</label>
                            <input id="bootstrap-username" className="input" type="text" autoComplete="username" value={bootstrapUsername} onChange={(e) => setBootstrapUsername(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="bootstrap-password">{t('auth.password')}</label>
                            <input id="bootstrap-password" className="input" type="password" autoComplete="new-password" minLength={8} value={bootstrapPassword} onChange={(e) => setBootstrapPassword(e.target.value)} required />
                            <p className="field-help">{t('shell.minChars')}</p>
                        </div>
                        {bootstrapError && <p className="form-error" role="alert">{bootstrapError}</p>}
                        <button id="bootstrap-submit" className="btn btn-primary auth-submit" disabled={bootstrapLoading}>
                            {bootstrapLoading ? t('common.loading') : t('auth.createAccount')}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="label" htmlFor="auth-username">{t('auth.username')}</label>
                            <input id="auth-username" className="input" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="auth-password">{t('auth.password')}</label>
                            <input id="auth-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        {error && <p className="form-error" role="alert">{error}</p>}
                        <button id="auth-submit" className="btn btn-primary auth-submit" disabled={loading}>
                            {loading ? t('common.loading') : t('auth.signin')}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
