import React, { useState } from 'react';
import { createServerChannel } from './api';
import AnimatedOverlay from './AnimatedOverlay';
import { useTranslation } from './i18n';
import './GroupCreate.css';

export default function ChannelCreateModal({ serverId, onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      setError(t('channelNameRequired'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const ch = await createServerChannel(serverId, n, description.trim() || undefined);
      onCreated(ch);
    } catch (e) {
      setError(e.message || t('channelCreateFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedOverlay onClose={onClose}>
      {({ close }) => (
      <div className="modal group-create" onClick={(e) => e.stopPropagation()}>
        <h2>{t('channelNewTitle')}</h2>
        <label className="form-label">{t('channelNameLabel')}</label>
        <input
          type="text"
          className="form-input"
          placeholder={t('channelNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          maxLength={50}
        />
        <label className="form-label">{t('channelDescriptionLabel')}</label>
        <textarea
          className="form-textarea"
          placeholder={t('channelDescriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={close}>{t('profileCancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? t('channelCreating') : t('channelCreate')}
          </button>
        </div>
      </div>
      )}
    </AnimatedOverlay>
  );
}
