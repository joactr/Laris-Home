import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearOfflineScopeData, getScopeFromUser } from '../services/offline.service';

interface User {
    id: string;
    name: string;
    username: string;
    is_admin: boolean;
    color: string;
    householdId: string | null;
}

interface AuthState {
    token: string | null;
    user: User | null;
    setAuth: (token: string, user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            user: null,
            setAuth: (token, user) => set({ token, user }),
            logout: () => {
                const currentUser = get().user;
                if (currentUser) {
                    void clearOfflineScopeData(getScopeFromUser(currentUser));
                }
                set({ token: null, user: null });
            },
        }),
        { name: 'laris-home-auth' }
    )
);
