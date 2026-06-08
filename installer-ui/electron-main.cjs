const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

let mainWindow = null;
let installedExePath = null;

function getConfigPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config.json');
  }
  const dev = path.join(__dirname, 'config.json');
  const root = path.join(__dirname, '..', 'installer', 'install-config.json');
  if (fs.existsSync(root)) return root;
  return dev;
}

function loadConfig() {
  const raw = fs.readFileSync(getConfigPath(), 'utf8');
  return JSON.parse(raw);
}

function expandEnv(p) {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
}

function getBundledSetup() {
  const bundled = path.join(process.resourcesPath, 'bundled', 'Nova-Setup-1.1.0.exe');
  if (fs.existsSync(bundled)) return bundled;
  const local = path.join(__dirname, '..', 'installer', 'releases', 'Nova-Setup-1.1.0.exe');
  if (fs.existsSync(local)) return local;
  const dir = path.join(__dirname, '..', 'installer', 'releases');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => /^Nova Setup.*\.exe$/i.test(f) || /^Nova-Setup.*\.exe$/i.test(f));
    if (files[0]) return path.join(dir, files[0]);
  }
  return null;
}

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install-progress', payload);
  }
}

function sendPhase(phase, detail) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install-phase', { phase, detail });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const request = proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let received = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        const pct = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
        sendProgress({
          percent: pct,
          received,
          total,
          speed: 0,
        });
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(dest));
      });
    });
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function runSetup(setupPath, installDir, silent) {
  return new Promise((resolve, reject) => {
    const args = silent ? ['/S'] : [];
    if (silent && installDir) args.push(`/D=${installDir}`);
    const proc = spawn(setupPath, args, { detached: false, windowsHide: true });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Код установки: ${code}`));
    });
  });
}

function findInstalledExe(installDir) {
  const candidates = [
    path.join(installDir, 'Nova.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Nova', 'Nova.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Nova', 'Nova.exe'),
    path.join(process.env.LOCALAPPDATA, 'Programs', 'Nova', 'Nova.exe'),
    path.join(process.env.LOCALAPPDATA, 'Nova', 'Nova.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createShortcut(exePath) {
  try {
    const { execSync } = require('child_process');
    const desktop = path.join(process.env.USERPROFILE, 'Desktop', 'Nova.lnk');
    const ps = `
      $w = New-Object -ComObject WScript.Shell
      $s = $w.CreateShortcut('${desktop.replace(/'/g, "''")}')
      $s.TargetPath = '${exePath.replace(/'/g, "''")}'
      $s.WorkingDirectory = '${path.dirname(exePath).replace(/'/g, "''")}'
      $s.Description = 'Nova Messenger'
      $s.Save()
    `;
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { windowsHide: true });
  } catch (e) {
    console.warn('Shortcut failed:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 520,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: '#1b2838',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.handle('get-config', () => {
  const cfg = loadConfig();
  const defaultDir = expandEnv(cfg.installDir || path.join(process.env.LOCALAPPDATA, 'Nova'));
  const bundled = !!getBundledSetup();
  return { ...cfg, defaultInstallDir: defaultDir, hasBundledSetup: bundled };
});

ipcMain.handle('select-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Папка установки Nova',
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('start-install', async (_e, { installDir }) => {
  const cfg = loadConfig();
  const targetDir = installDir || expandEnv(cfg.installDir);
  const tempDir = path.join(app.getPath('temp'), 'nova-install-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    sendPhase('prepare', 'Подготовка…');
    let setupPath = getBundledSetup();

    if (!setupPath) {
      const url = (cfg.downloadUrl || '').trim();
      if (!url || url.includes('ВАШ-СЕРВЕР')) {
        throw new Error('Нет файла установки. Соберите build-steam-installer.bat или укажите downloadUrl в config.json');
      }
      sendPhase('download', 'Загрузка Nova…');
      const fileName = cfg.setupFileName || 'Nova-Setup.exe';
      setupPath = path.join(tempDir, fileName);
      await downloadFile(url, setupPath);
      sendProgress({ percent: 100, received: 0, total: 0 });
    } else {
      sendPhase('download', 'Используется локальная копия');
      await new Promise((r) => setTimeout(r, 400));
      sendProgress({ percent: 100 });
    }

    sendPhase('install', 'Установка компонентов…');
    for (let i = 0; i <= 100; i += 8) {
      sendProgress({ percent: i, phase: 'install' });
      await new Promise((r) => setTimeout(r, 80));
    }

    await runSetup(setupPath, targetDir, cfg.silentSetup !== false);
    await new Promise((r) => setTimeout(r, 1500));

    installedExePath = findInstalledExe(targetDir);
    if (cfg.createDesktopShortcut !== false && installedExePath) {
      createShortcut(installedExePath);
    }

    sendProgress({ percent: 100 });
    sendPhase('done', 'Готово');
    return { success: true, exePath: installedExePath };
  } catch (err) {
    sendPhase('error', err.message);
    throw err;
  }
});

ipcMain.handle('launch-app', () => {
  if (installedExePath && fs.existsSync(installedExePath)) {
    spawn(installedExePath, [], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
    return true;
  }
  return false;
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => app.quit());
