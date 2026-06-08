import { createContext } from 'react';

const GLOBAL_KEY = '__NOVA_AUTH_CONTEXT__';

/** Один экземпляр контекста — не ломается при Vite HMR / React Fast Refresh */
export const AuthContext = (() => {
  if (typeof globalThis !== 'undefined' && globalThis[GLOBAL_KEY]) {
    return globalThis[GLOBAL_KEY];
  }
  const ctx = createContext(null);
  if (typeof globalThis !== 'undefined') {
    globalThis[GLOBAL_KEY] = ctx;
  }
  return ctx;
})();
