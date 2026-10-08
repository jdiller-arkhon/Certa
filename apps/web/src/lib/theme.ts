import type { ThemeName } from '@certa/core';

const KEY = 'certa.theme';

export function readTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'sunlight') return v;
  } catch {}
  return 'light';
}

export function writeTheme(theme: ThemeName) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  document.documentElement.dataset.theme = theme;
}
