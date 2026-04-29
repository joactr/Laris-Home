import type {
    ProjectInput,
    ProjectSummary,
    ProjectTask,
    ProjectTaskInput,
} from '../../../shared/contracts';
import { request } from './client';

export const projectsApi = {
    getAll: () => request<ProjectSummary[]>('/projects'),
    create: (data: ProjectInput) => request<ProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ProjectInput>) => request<ProjectSummary>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    getTasks: (projectId: string) => request<ProjectTask[]>(`/projects/${projectId}/tasks`),
    createTask: (projectId: string, data: ProjectTaskInput) =>
        request<ProjectTask>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    updateTask: (id: string, data: Partial<ProjectTaskInput>) =>
        request<ProjectTask>(`/projects/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteTask: (id: string) => request<{ ok: boolean }>(`/projects/tasks/${id}`, { method: 'DELETE' }),
};
