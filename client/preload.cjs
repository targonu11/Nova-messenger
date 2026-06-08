const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_, info) => cb(info));
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.on('update-downloaded', (_, info) => cb(info));
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getDisplayMedia: async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
      // Возвращаем источники для выбора пользователем
      return sources;
    } catch (err) {
      console.error('Failed to get display sources:', err);
      throw err;
    }
  },
  showScreenPicker: () => ipcRenderer.invoke('show-screen-picker'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  onActivityDetected: (cb) => {
    const handler = (_, activities) => cb(activities);
    ipcRenderer.on('activity-detected', handler);
    return () => ipcRenderer.removeListener('activity-detected', handler);
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
