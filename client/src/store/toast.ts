import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ items: [...state.items, { ...toast, id }] }));
    window.setTimeout(() => {
      get().remove(id);
    }, 4200);
  },
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

export function toastSuccess(title: string, message?: string) {
  useToastStore.getState().push({ title, message, tone: 'success' });
}

export function toastError(title: string, message?: string) {
  useToastStore.getState().push({ title, message, tone: 'error' });
}

export function toastInfo(title: string, message?: string) {
  useToastStore.getState().push({ title, message, tone: 'info' });
}

