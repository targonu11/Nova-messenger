import { useState, useEffect } from 'react';

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState(null);

  useEffect(() => {
    const api = typeof window !== 'undefined' && window.electronAPI;
    if (!api || !api.isElectron) return;

    api.onUpdateAvailable((info) => {
      setUpdateState({ status: 'available', version: info?.version });
    });
    api.onUpdateDownloaded((info) => {
      setUpdateState({ status: 'downloaded', version: info?.version });
    });
  }, []);

  const installUpdate = () => {
    if (window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate();
    }
  };

  return { updateState, installUpdate, isElectron: Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron) };
}
