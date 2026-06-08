import React, { useMemo, useState, useRef } from 'react';
import { createGroup, uploadGroupAvatar, updateGroup } from './api';
import { useTranslation } from './i18n';
import './ChannelCreate.css';

export default function ChannelCreate({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const canSubmit = useMemo(() => name.trim().length > 0 && !loading, [name, loading]);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Выберите изображение');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер изображения должен быть меньше 5MB');
      return;
    }

    setError('');
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      setError('Введите название канала');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Личный канал — только админ публикует, подписчики читают
      const created = await createGroup(n, [], 'channel');
      const groupId = created?.id;

      if (groupId && description.trim()) {
        await updateGroup(groupId, undefined, undefined, { description: description.trim() });
      }

      if (groupId && avatarFile) {
        await uploadGroupAvatar(groupId, avatarFile);
      }

      onCreated?.();
    } catch (err) {
      setError(err?.message || 'Не удалось создать канал');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal channel-create" onClick={(e) => e.stopPropagation()}>
        <div className="channel-create-header">
          <h2>Создать канал</h2>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Закрыть">
            <span className="icon-close">×</span>
          </button>
        </div>

        <div className="channel-create-avatar">
          <div className="channel-create-avatar-preview">
            {previewUrl ? (
              <img className="avatar-lg" src={previewUrl} alt="" />
            ) : (
              <div className="channel-create-avatar-placeholder">#</div>
            )}
          </div>
          <label className="btn-avatar-upload">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
            Выбрать фото
          </label>
        </div>

        <label className="form-label">Название канала</label>
        <input
          type="text"
          className="form-input"
          placeholder={t('channelNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {loading ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

