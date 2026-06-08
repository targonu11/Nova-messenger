const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novaInstaller', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startInstall: (opts) => ipcRenderer.invoke('start-install', opts),
  launchApp: () => ipcRenderer.invoke('launch-app'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('install-progress', handler);
    return () => ipcRenderer.removeListener('install-progress', handler);
  },
  onPhase: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('install-phase', handler);
    return () => ipcRenderer.removeListener('install-phase', handler);
  },
});
