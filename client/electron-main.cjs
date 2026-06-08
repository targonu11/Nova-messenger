const { app, BrowserWindow, Menu, ipcMain, desktopCapturer, session, dialog, shell } = require('electron');
const { startActivityDetector, stopActivityDetector } = require('./activityDetector.cjs');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Устанавливаем имя приложения
app.setName('Nova');
if (app.setAppUserModelId) {
  app.setAppUserModelId('com.nova.messenger');
}

let mainWindow = null;

function createWindow(options = {}) {
  Menu.setApplicationMenu(null);

  const preloadPath = path.join(__dirname, 'preload.cjs');
  const { show = true } = options;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    title: 'Nova',
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      allowRunningInsecureContent: false,
      webSecurity: true,
    },
  });

  mainWindow = win;

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  win.on('closed', () => { mainWindow = null; });

  // Поддержка getDisplayMedia для screen sharing
  // Используем session.defaultSession.setDisplayMediaRequestHandler если доступен
  if (session.defaultSession && typeof session.defaultSession.setDisplayMediaRequestHandler === 'function') {
    // Поддержка getDisplayMedia через кастомный диалог (основной путь)
    // Fallback для случаев, когда используется стандартный getDisplayMedia
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      console.log('Display media request received (fallback)');
      desktopCapturer.getSources({ types: ['window', 'screen'] }).then((sources) => {
        if (!sources || sources.length === 0) {
          callback({ video: false, audio: false });
          return;
        }
        // Автоматически выбираем первый экран как fallback
        const screenSource = sources.find(s => 
          (s.id && s.id.startsWith('screen:')) || 
          s.name === 'Entire Screen' || 
          s.name === 'Screen 1' ||
          (s.name && s.name.includes('Screen'))
        ) || sources[0];
        
        if (screenSource && screenSource.id) {
          callback({ video: screenSource, audio: false });
        } else {
          callback({ video: false, audio: false });
        }
      }).catch((err) => {
        console.error('Failed to get display sources:', err);
        callback({ video: false, audio: false });
      });
    }, { useSystemPicker: false });
  }

  // Обработка клика по уведомлению - фокусируем окно
  app.on('browser-window-focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  if (show) {
    win.once('ready-to-show', () => win.show());
  }

  return win;
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// IPC handlers для screen sharing
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  } catch (err) {
    console.error('Failed to get screen sources:', err);
    return [];
  }
});

ipcMain.handle('show-screen-picker', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    if (sources.length === 0) return null;
    
    // Отправляем источники в renderer для показа диалога
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screen-sources-available', sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })));
    }
    return sources;
  } catch (err) {
    console.error('Failed to show screen picker:', err);
    return null;
  }
});

ipcMain.handle('open-external', async (_, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  const runWithUpdateCheck = !isDev && app.isPackaged;

  startActivityDetector((activities) => {
    sendToRenderer('activity-detected', activities);
  }, 4000);

  if (runWithUpdateCheck) {
    createWindow({ show: false });
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('update-available', (info) => {
        sendToRenderer('update-available', { version: info.version });
      });
      autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer('update-downloaded', { version: info.version });
      });
      autoUpdater.on('error', (err) => {
        console.error('Auto-update error:', err);
      });

      ipcMain.handle('install-update', () => {
        autoUpdater.quitAndInstall(false, true);
      });

      autoUpdater.checkForUpdates()
        .then((result) => {
          if (result && result.updateInfo) {
            autoUpdater.once('update-downloaded', () => {
              autoUpdater.quitAndInstall(false, true);
            });
          } else {
            showWindow();
          }
        })
        .catch(() => {
          showWindow();
        });
    } catch (e) {
      console.error('electron-updater not available:', e.message);
      showWindow();
    }
  } else {
    createWindow({ show: true });
  }
});

app.on('window-all-closed', () => {
  stopActivityDetector();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
