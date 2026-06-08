import React, { useCallback, useEffect, useState } from 'react';
import { getConnectionProviders, getMyConnections, disconnectConnection, getConnectionStartUrl } from './api';
import { useAuth } from './useAuth';
import { OAUTH_CONNECTION_PROVIDERS } from './socialProviders';
import './ProfileConnections.css';

export default function ProfileConnections({ t }) {
  const { accessToken, refreshUser } = useAuth();
  const [configured, setConfigured] = useState([]);
  const [connections, setConnections] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [prov, mine] = await Promise.all([
        getConnectionProviders(),
        getMyConnections(),
      ]);
      setConfigured(Array.isArray(prov?.providers) ? prov.providers : []);
      setConnections(Array.isArray(mine?.connections) ? mine.connections : []);
    } catch {
      setConfigured([]);
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));

  const connect = async (provider) => {
    if (!accessToken) return;
    setError('');
    setBusy(provider);
    try {
      const url = getConnectionStartUrl(provider, accessToken);
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setError(t('connectionStartFailed'));
    } finally {
      setBusy('');
    }
  };

  const disconnect = async (provider) => {
    setError('');
    setBusy(provider);
    try {
      await disconnectConnection(provider);
      await load();
      refreshUser?.();
    } catch {
      setError(t('connectionDisconnectFailed'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="profile-connections">
      <p className="form-hint profile-connections-hint">{t('connectionsHint')}</p>
      <div className="profile-connections-list">
        {OAUTH_CONNECTION_PROVIDERS.map((p) => {
          const linked = byProvider[p.id];
          const canConnect = configured.includes(p.id);
          return (
            <div key={p.id} className={`profile-connection-row profile-connection-row--${p.id}`}>
              <div className="profile-connection-info">
                <span className="profile-connection-name">{t(p.labelKey)}</span>
                {linked ? (
                  <span className="profile-connection-linked">
                    <span className="profile-connection-verified" title={t('connectionVerified')}>✓</span>
                    {linked.displayName || linked.username}
                  </span>
                ) : (
                  <span className="profile-connection-unlinked">{t('connectionNotLinked')}</span>
                )}
              </div>
              <div className="profile-connection-actions">
                {linked ? (
                  <button
                    type="button"
                    className="profile-connection-btn profile-connection-btn--danger"
                    disabled={busy === p.id}
                    onClick={() => disconnect(p.id)}
                  >
                    {t('connectionDisconnect')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="profile-connection-btn profile-connection-btn--primary"
                    disabled={!canConnect || busy === p.id}
                    title={!canConnect ? t('connectionNotConfigured') : t('connectionConnect')}
                    onClick={() => connect(p.id)}
                  >
                    {t('connectionConnect')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="profile-connections-refresh" onClick={load}>{t('connectionRefresh')}</button>
    </div>
  );
}
