import React, { useState } from 'react';
import { updateCustomStatus } from './api';
import { STATUS_PRESETS } from './customStatus';
import { useTranslation } from './i18n';
import './StatusPicker.css';

export default function StatusPicker({ user, onClose, onUpdated, compact = false }) {
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState(user?.customStatusEmoji || '');
  const [text, setText] = useState(user?.customStatusText || '');
  const [mode, setMode] = useState(user?.customStatusMode || 'online');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (preset) => {
    setEmoji(preset.emoji);
    setText(preset.text);
    setMode(preset.mode);
  };

  const save = async (payload) => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateCustomStatus(payload);
      onUpdated?.(updated);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`status-picker-overlay${compact ? ' status-picker-overlay--compact' : ''}`} role="presentation" onClick={onClose}>
      <div className={`status-picker-modal${compact ? ' status-picker-modal--compact' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="status-picker-header">
          <h3>{t('customStatusTitle')}</h3>
          <button type="button" className="status-picker-close" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        <div className="status-picker-presets">
          {STATUS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="status-picker-preset"
              disabled={saving}
              onClick={() => applyPreset(p)}
            >
              <span className="status-picker-preset-emoji">{p.emoji || '🟢'}</span>
              <span>{t(p.labelKey)}</span>
            </button>
          ))}
        </div>
        <div className="status-picker-custom">
          <input
            type="text"
            className="status-picker-emoji-input"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            placeholder="😊"
            maxLength={4}
            aria-label={t('customStatusEmoji')}
          />
          <input
            type="text"
            className="status-picker-text-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 80))}
            placeholder={t('customStatusPlaceholder')}
            maxLength={80}
          />
        </div>
        {error && <p className="status-picker-error">{error}</p>}
        <div className="status-picker-actions">
          <button
            type="button"
            className="status-picker-btn status-picker-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="status-picker-btn status-picker-btn-primary"
            disabled={saving}
            onClick={() => save({ emoji: emoji.trim(), text: text.trim(), mode: mode || 'online' })}
          >
            {saving ? t('uploading') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
