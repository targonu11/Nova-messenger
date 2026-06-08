/** Тема приложения (localStorage) — отдельный лёгкий модуль без React, чтобы main.jsx не тянул MessengerSettingsModal. */

const THEME_KEY = 'nova_theme';

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme === 'light' ? 'light' : 'dark');
  } catch (e) {}
}

export function applyTheme(theme) {
  const v = theme === 'light' ? 'light' : 'dark';
  setStoredTheme(v);
  document.documentElement.setAttribute('data-theme', v);
}
