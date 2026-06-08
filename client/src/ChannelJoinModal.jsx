import React, { useState } from 'react';
import { joinChannelByInvite } from './api';
import { useTranslation } from './i18n';
import AnimatedOverlay from './AnimatedOverlay';
import './ChannelCreate.css';

export default function ChannelJoinModal({ onClose, onJoined }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t('channelJoinCodeRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const channel = await joinChannelByInvite(trimmed);
      if (onJoined) await onJoined(channel);
      onClose();
    } catch (err) {
      setError(err.message || t('channelJoinFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedOverlay onClose={onClose}>
      {({ close }) => (
        <div className="modal channel-create" onClick={(e) => e.stopPropagation()}>
          <div className="channel-create-header">
            <h2>{t('channelJoinTitle')}</h2>
            <button type="button" className="btn-icon-close" onClick={close} aria-label={t('close')}>
              <span className="icon-close">×</span>
            </button>
          </div>
          <form className="channel-create-form" onSubmit={handleJoin}>
            <p className="channel-create-hint">{t('channelJoinHint')}</p>
            <div className="form-field">
              <label className="form-label">{t('channelJoinCodeLabel')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t('channelJoinCodePlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                maxLength={32}
              />
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={close} disabled={loading}>
                {t('profileCancel')}
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('channelJoining') : t('channelJoinAction')}
              </button>
            </div>
          </form>
        </div>
      )}
    </AnimatedOverlay>
  );
}
