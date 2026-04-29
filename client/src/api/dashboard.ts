import type { DashboardPayload, DashboardSummary } from '../../../shared/contracts';
import { request } from './client';

export const dashboardApi = {
    get: () => request<DashboardPayload>('/dashboard'),
    getSummary: () => request<DashboardSummary>('/dashboard/summary'),
};
