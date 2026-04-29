import type { AuthUser, LoginResponse } from '../../../shared/contracts';
import { request } from './client';

export const authApi = {
    login: (username: string, password: string) =>
        request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (name: string, username: string, password: string) =>
        request<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, username, password }) }),
    getUsers: () => request<AuthUser[]>('/auth/users'),
    changePassword: (id: string, password: string) =>
        request<{ success: boolean }>(`/auth/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    me: () => request<AuthUser>('/auth/me'),
    members: () => request<AuthUser[]>('/auth/household/members'),
    validateToken: async () => {
        await request<AuthUser>('/auth/me');
        return true;
    },
};
