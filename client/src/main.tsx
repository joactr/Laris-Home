import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Register service worker for PWA (Only in Production mode)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('[SW] Registered:', reg.scope);
        }).catch((err) => {
            console.error('[SW] Registration failed:', err);
        });
    });

    // Reload page when new service worker takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] New controller, reloading page...');
        window.location.reload();
    });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    // Unregister any existing service workers during development to prevent HMR issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
            registration.unregister().then(() => {
                console.log('[SW] Unregistered in DEV mode');
            });
        }
    });
}
