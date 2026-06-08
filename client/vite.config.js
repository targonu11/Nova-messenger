import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
const appVersion = pkg.version || '0.0.0';
const serverDir = resolve(__dirname, '..', 'server');
const portFilePath = resolve(serverDir, '.nova-port');

function readApiPort() {
  try {
    const n = parseInt(readFileSync(portFilePath, 'utf8').trim(), 10);
    if (n > 0) return n;
  } catch (_) { /* default */ }
  return 3001;
}

/** Прокси /api → актуальный порт сервера (server/.nova-port), иначе :3001 */
function novaDevApiProxy() {
  return {
    name: 'nova-dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      const proxyPaths = ['/api', '/uploads'];
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        const match = proxyPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
        if (!match) return next();

        const port = readApiPort();
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `localhost:${port}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', (err) => {
          console.log(`[vite] API proxy error (:${port}):`, err.message);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              error: `Nova server not reachable on port ${port}. Run start-all.bat and wait for [server] Server running.`,
            }));
          }
        });
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          req.pipe(proxyReq);
        } else {
          proxyReq.end();
        }
      });
    },
  };
}

/** В dev: если на :3001 нет маршрута GET /api/servers (старый сервер), не отдаём 404 в браузер — тишина в консоли и пустой список. */
function novaDevServersApiFallback() {
  return {
    name: 'nova-dev-servers-api-fallback',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== '/api/servers') return next();

        const port = readApiPort();
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: req.url,
            method: 'GET',
            headers: { ...req.headers, host: `localhost:${port}` },
          },
          (proxyRes) => {
            if (proxyRes.statusCode === 404) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end('[]');
              proxyRes.destroy();
              return;
            }
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.statusCode = 200;
          res.end('[]');
        });
        proxyReq.end();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [novaDevApiProxy(), novaDevServersApiFallback(), react()],
  base: './',
  // Только корневой index.html — иначе Vite сканирует android/build, release/*.html и падает на старых бандлах
  optimizeDeps: {
    entries: [resolve(__dirname, 'index.html')],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'socket.io-client',
    ],
  },
  resolve: {
    alias: {
      'react-native-fs': resolve(__dirname, 'src/shims/react-native-fs-empty.js'),
    },
  },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    // В dev не кэшировать entry — иначе браузер может держать старые ссылки на /node_modules/.vite/deps/*
    ...(command === 'serve'
      ? { headers: { 'Cache-Control': 'no-store' } }
      : {}),
    // /api, /uploads — novaDevApiProxy; socket.io — встроенный WS-прокси
    proxy: command === 'serve' ? {
      '/socket.io': {
        target: `http://127.0.0.1:${readApiPort()}`,
        changeOrigin: true,
        ws: true,
      },
    } : undefined,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
}));
