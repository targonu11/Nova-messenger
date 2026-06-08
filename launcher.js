/**
 * Запуск сервера и веб-клиента в одном процессе (без concurrently).
 * Работает на Windows и других ОС.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const serverDir = path.join(root, 'server');
const clientDir = path.join(root, 'client');

function prefixStream(stream, prefix) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => console.log(`${prefix} ${line}`));
  });
}

function run(cmd, args, cwd, prefix) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  prefixStream(child.stdout, prefix);
  prefixStream(child.stderr, prefix);
  child.on('error', (err) => {
    console.error(prefix, 'Failed to start:', err.message);
  });
  child.on('exit', (code, signal) => {
    if (code != null && code !== 0) {
      console.error(prefix, `Exited with code ${code}`);
    }
    if (signal) {
      console.error(prefix, `Killed by signal ${signal}`);
    }
    process.exit(code != null ? code : 1);
  });
  return child;
}

// Проверка наличия папок и node_modules
if (!fs.existsSync(path.join(serverDir, 'index.js'))) {
  console.error('Не найден server/index.js. Запускайте из корня проекта.');
  process.exit(1);
}
if (!fs.existsSync(path.join(clientDir, 'node_modules', 'vite'))) {
  console.error('У клиента не установлены зависимости. Выполните: npm install --prefix client');
  process.exit(1);
}

// Сброс кэша pre-bundle (504 Outdated Optimize Dep). Пропуск: NOVA_SKIP_VITE_CLEAR=1
const viteCacheDir = path.join(clientDir, 'node_modules', '.vite');
if (process.env.NOVA_SKIP_VITE_CLEAR !== '1') {
  try {
    if (fs.existsSync(viteCacheDir)) {
      fs.rmSync(viteCacheDir, { recursive: true, force: true });
      console.log('[client] Очищен кэш Vite (node_modules/.vite)\n');
    }
  } catch (e) {
    console.warn('[client] Не удалось очистить .vite:', e.message);
  }
}

console.log('========================================');
console.log('  Nova — сервер и клиент (веб)');
console.log('========================================\n');
console.log('Сервер: http://localhost:3001');
console.log('Клиент: http://localhost:5173');
console.log('Остановка: Ctrl+C\n');

const serverProc = run('node', ['index.js'], serverDir, '[server]');

function waitForServerPort(maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  const portFile = path.join(serverDir, '.nova-port');
  return new Promise((resolve) => {
    const tick = () => {
      if (fs.existsSync(portFile)) {
        resolve(fs.readFileSync(portFile, 'utf8').trim());
        return;
      }
      if (Date.now() >= deadline) {
        console.warn('[launcher] server/.nova-port not found yet — starting Vite anyway (default :3001)\n');
        resolve('3001');
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

waitForServerPort().then((port) => {
  console.log(`[launcher] API port: ${port}\n`);
  const viteBin = path.join(clientDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteArgs = [viteBin];
  if (process.env.VITE_FORCE === '1' || process.env.NOVA_VITE_FORCE === '1') {
    viteArgs.push('--force');
    console.log('[client] Vite --force (пересборка optimize deps)\n');
  }
  const clientProc = run('node', viteArgs, clientDir, '[client]');

  function killAll() {
    serverProc.kill('SIGTERM');
    clientProc.kill('SIGTERM');
    process.exit(0);
  }

  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
});
