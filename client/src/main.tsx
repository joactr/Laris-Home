import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ensurePwaVersion, registerPwaRefreshHandler, requestPwaHardReload, usePwaStore } from './store/pwa';
import './styles/global.css';

const UI_VERSION = '2026-03-30-1';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Register service worker for PWA (Only in Production mode)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const setUpdateAvailable = usePwaStore.getState().setUpdateAvailable;

    void ensurePwaVersion(UI_VERSION);

    const wireRegistration = (registration: ServiceWorkerRegistration) => {
        const markWaitingWorker = () => {
            if (registration.waiting) {
                setUpdateAvailable(true);
            }
        };

        markWaitingWorker();
        void registration.update();

        registration.addEventListener('updatefound', () => {
            const nextWorker = registration.installing;
            if (!nextWorker) return;

            nextWorker.addEventListener('statechange', () => {
                if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    setUpdateAvailable(true);
                }
            });
        });

        registerPwaRefreshHandler(async () => {
            await registration.update();

            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                return;
            }

            await requestPwaHardReload();
        });
    };

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                wireRegistration(registration);
            })
            .catch((err) => {
                console.error('[SW] Registration failed:', err);
            });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        setUpdateAvailable(false);
        window.location.reload();
    });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    // Unregister any existing service workers during development to prevent HMR issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
            registration.unregister();
        }
    });
}
