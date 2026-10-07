import { create } from 'zustand';
import { storage } from './utils';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'cui-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
}

const initial = (storage.get(KEY) as ThemePreference | null) ?? 'system';
apply(initial);

export const useTheme = create<{
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}>((set) => ({
  preference: initial,
  setPreference: (preference) => {
    storage.set(KEY, preference);
    apply(preference);
    set({ preference });
  },
}));

media.addEventListener('change', () => apply(useTheme.getState().preference));
