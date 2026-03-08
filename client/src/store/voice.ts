import { create } from 'zustand';

interface VoiceStore {
  onResult: ((transcript: string) => Promise<void>) | null;
  placeholder: string;
  isEnabled: boolean;
  register: (onResult: (transcript: string) => Promise<void>, placeholder?: string) => void;
  unregister: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  onResult: null,
  placeholder: '',
  isEnabled: false,
  register: (onResult, placeholder = '') => set({ onResult, placeholder, isEnabled: true }),
  unregister: () => set({ onResult: null, placeholder: '', isEnabled: false }),
}));
