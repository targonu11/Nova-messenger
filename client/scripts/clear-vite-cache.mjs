/**
 * Удаляет node_modules/.vite перед dev — убирает 504 Outdated Optimize Dep.
 * Пропуск: NOVA_SKIP_VITE_CLEAR=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..');
const viteCache = path.join(clientRoot, 'node_modules', '.vite');

if (process.env.NOVA_SKIP_VITE_CLEAR === '1') {
  process.exit(0);
}

try {
  if (fs.existsSync(viteCache)) {
    fs.rmSync(viteCache, { recursive: true, force: true });
    console.log('[vite] очищен кэш node_modules/.vite');
  }
} catch (e) {
  console.warn('[vite] не удалось очистить .vite:', e?.message || e);
  process.exitCode = 0;
}
