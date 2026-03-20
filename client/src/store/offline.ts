import { create } from 'zustand';

interface OfflineState {
  isOffline: boolean;
  pendingCount: number;
  lastSyncedAt: number | null;
  setIsOffline: (isOffline: boolean) => void;
  setPendingCount: (pendingCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number | null) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  pendingCount: 0,
  lastSyncedAt: null,
  setIsOffline: (isOffline) => set({ isOffline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
