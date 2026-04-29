import { create } from 'zustand';

type PwaState = {
  updateAvailable: boolean;
  setUpdateAvailable: (updateAvailable: boolean) => void;
};

let refreshHandler: null | (() => Promise<void> | void) = null;

export const usePwaStore = create<PwaState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
}));

export function registerPwaRefreshHandler(handler: () => Promise<void> | void) {
  refreshHandler = handler;
}

async function hardReloadPwa() {
  if (typeof window === 'undefined') return;

  if ('caches' in window) {
    const cacheKeys = await window.caches.keys();
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
  }

  const indexedDbApi = typeof indexedDB !== 'undefined' ? (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }) : null;
  if (indexedDbApi?.databases) {
    const databases = await indexedDbApi.databases();
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .map((name) => new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }))
    );
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_app_refresh', Date.now().toString());
  window.location.replace(url.toString());
}

export async function requestPwaRefresh() {
  if (refreshHandler) {
    await refreshHandler();
    return;
  }

  await hardReloadPwa();
}

export async function requestPwaHardReload() {
  await hardReloadPwa();
}

export async function ensurePwaVersion(version: string) {
  if (typeof window === 'undefined') return;

  const storageKey = 'laris-home-ui-version';
  const currentVersion = window.localStorage.getItem(storageKey);
  if (!currentVersion) {
    window.localStorage.setItem(storageKey, version);
    return;
  }

  if (currentVersion !== version) {
    window.localStorage.setItem(storageKey, version);
    await hardReloadPwa();
  }
}
