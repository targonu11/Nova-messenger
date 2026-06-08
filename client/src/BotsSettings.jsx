import React, { useEffect, useState } from 'react';
import { createBot, deleteBot, getBots, rotateBotToken } from './api';
import { useTranslation } from './i18n';

export function BotsSettings({ onOpenChat }) {
  const { t } = useTranslation();
  const [bots, setBots] = useState([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newToken, setNewToken] = useState(null);

  const load = () => {
    getBots()
      .then(setBots)
      .catch(() => setBots([]));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setNewToken(null);
    setBusy(true);
    try {
      const bot = await createBot({ username, displayName, description });
      setNewToken({ username: bot.username, token: bot.token });
      setUsername('');
      setDisplayName('');
      setDescription('');
      load();
    } catch (err) {
      setError(err.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async (botId) => {
    setError('');
    try {
      const { token } = await rotateBotToken(botId);
      setNewToken({ botId, token });
    } catch (err) {
      setError(err.message || 'Error');
    }
  };

  const handleDelete = async (botId) => {
    if (!window.confirm(t('botsDeleteConfirm'))) return;
    setError('');
    try {
      await deleteBot(botId);
      load();
    } catch (err) {
      setError(err.message || 'Error');
    }
  };

  return (
    <div className="bots-settings">
      <p className="bots-settings-hint">{t('botsHint')}</p>

      <div className="bots-settings-system">
        <div className="bots-settings-system-title">@StickerBot</div>
        <p className="bots-settings-hint">{t('stickerBotHint')}</p>
        <button type="button" className="btn-secondary" onClick={() => onOpenChat?.('StickerBot')}>
          {t('stickerOpenBot')}
        </button>
      </div>

      <form className="bots-settings-form" onSubmit={handleCreate}>
        <label className="form-label">{t('botsCreateTitle')}</label>
        <input
          className="form-input"
          placeholder={t('botsUsernamePlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          maxLength={32}
          required
        />
        <input
          className="form-input"
          placeholder={t('botsDisplayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
        />
        <input
          className="form-input"
          placeholder={t('botsDescriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
        <button type="submit" className="btn-primary" disabled={busy}>{t('botsCreateButton')}</button>
      </form>

      {newToken && (
        <div className="bots-settings-item">
          <div className="bots-settings-item-name">{t('botsTokenTitle')}</div>
          <div className="bots-settings-token">{newToken.token}</div>
          <p className="bots-settings-hint">{t('botsTokenHint')}</p>
        </div>
      )}

      {error && <p className="modal-error">{error}</p>}

      <div className="bots-settings-list">
        {bots.map((b) => (
          <div key={b.id} className="bots-settings-item">
            <div className="bots-settings-item-name">@{b.username}</div>
            <div className="bots-settings-item-meta">{b.displayName}{b.description ? ` — ${b.description}` : ''}</div>
            <div className="bots-settings-actions">
              <button type="button" className="btn-secondary" onClick={() => onOpenChat?.(b.username)}>{t('botsOpenChat')}</button>
              <button type="button" className="btn-secondary" onClick={() => handleRotate(b.id)}>{t('botsRotateToken')}</button>
              <button type="button" className="btn-secondary" onClick={() => handleDelete(b.id)}>{t('botsDelete')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
