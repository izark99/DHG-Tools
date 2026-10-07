// Light / dark mode. "system" follows the OS setting (prefers-color-scheme); "light" / "dark" are
// forced with <html data-theme>. The choice is kept per browser in localStorage (public/theme-init.js
// applies it before the first paint).
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'cb-forms.theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = read();
const subs = new Set<() => void>();

export function setThemePref(p: ThemePref) {
  pref = p;
  const root = document.documentElement;
  if (p === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p);
  try {
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  subs.forEach((f) => f());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => pref,
  );
}

export const THEME_LABEL: Record<ThemePref, string> = { system: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' };
export const THEME_ICON: Record<ThemePref, string> = { system: 'desktop', light: 'sun', dark: 'moon' };
const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
export const nextTheme = (p: ThemePref) => NEXT[p];
