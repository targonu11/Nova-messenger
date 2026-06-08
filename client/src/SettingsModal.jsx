import React, { useState, useEffect } from 'react';
import { BACKGROUND_PRESETS } from './groupBackgrounds';
import { uploadChatBackground, blockUser, deleteDirectChat } from './api';
import { t } from './i18n';
import { pickImageFromGallery } from './pickGalleryImage';
import './SettingsModal.css';

const CHAT_BG_KEY = 'nova_chat_backgrounds'; // Изменено на множественное число для хранения объекта
const CONTACT_NAMES_KEY = 'nova_contact_names';

// Получить фон для конкретного чата
export function getStoredChatBackground(chatId) {
  try {
    const raw = localStorage.getItem(CHAT_BG_KEY);
    if (!raw) return '';
    const o = JSON.parse(raw);
    return (typeof o === 'object' && o !== null && chatId) ? (o[String(chatId)] || '') : '';
  } catch {
    return '';
  }
}

// Сохранить фон для конкретного чата
export function setStoredChatBackground(chatId, value) {
  try {
    if (!chatId) return;
    const raw = localStorage.getItem(CHAT_BG_KEY);
    let o = raw ? JSON.parse(raw) : {};
    if (typeof o !== 'object' || o === null) o = {};
    if (value) {
      o[String(chatId)] = value;
    } else {
      delete o[String(chatId)];
    }
    localStorage.setItem(CHAT_BG_KEY, JSON.stringify(o));
  } catch (e) {}
}

export function getStoredContactNames() {
  try {
    const raw = localStorage.getItem(CONTACT_NAMES_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return typeof o === 'object' && o !== null ? o : {};
  } catch {
    return {};
  }
}

export function setStoredContactName(userId, name) {
  try {
    const o = getStoredContactNames();
    if (name) o[String(userId)] = name;
    else delete o[String(userId)];
    localStorage.setItem(CONTACT_NAMES_KEY, JSON.stringify(o));
  } catch (e) {}
}

export default function SettingsModal({ currentPeer, contactName, setContactName, chatBackground, setChatBackground, onClose, onCloseChat }) {
  const [name, setName] = useState(contactName || '');
  const [saved, setSaved] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    setName(contactName || '');
  }, [contactName, currentPeer?.id]);

  // Получаем фон для текущего чата
  const currentChatBackground = currentPeer?.id ? chatBackground : '';

  const handleSaveName = () => {
    if (!currentPeer?.id) return;
    const v = name.trim();
    setStoredContactName(currentPeer.id, v);
    setContactName(currentPeer.id, v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleBackground = (presetId) => {
    if (!currentPeer?.id) return; // Фон можно установить только для конкретного чата
    const v = presetId || '';
    setStoredChatBackground(currentPeer.id, v);
    setChatBackground(currentPeer.id, v);
  };

  const applyPhotoBackgroundFile = async (file) => {
    if (!currentPeer?.id || !file || !file.type.startsWith('image/')) return;
    setBgError(null);
    setBgUploading(true);
    try {
      const { path } = await uploadChatBackground(file);
      setStoredChatBackground(currentPeer.id, path);
      setChatBackground(currentPeer.id, path);
    } catch (err) {
      setBgError(err?.message || 'Ошибка загрузки');
    } finally {
      setBgUploading(false);
    }
  };

  const handlePhotoBackground = async (e) => {
    if (!currentPeer?.id) return;
    const file = e.target?.files?.[0];
    if (e.target) e.target.value = '';
    await applyPhotoBackgroundFile(file);
  };

  const handlePhotoBackgroundFromGallery = async () => {
    if (!currentPeer?.id || bgUploading) return;
    const file = await pickImageFromGallery();
    await applyPhotoBackgroundFile(file);
  };

  const handleBlock = async () => {
    if (!currentPeer?.id) return;
    setActionError(null);
    try {
      await blockUser(currentPeer.id);
      setConfirmAction(null);
      onClose();
      onCloseChat?.(currentPeer.id);
    } catch (err) {
      setActionError(err?.message || 'Ошибка');
    }
  };

  const handleDeleteChat = async () => {
    if (!currentPeer?.id) return;
    setActionError(null);
    try {
      await deleteDirectChat(currentPeer.id);
      setConfirmAction(null);
      onClose();
      onCloseChat?.(currentPeer.id);
    } catch (err) {
      setActionError(err?.message || 'Ошибка');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>{t('settingsTitle')}</h2>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label={t('close')}>
            <span className="icon-close">×</span>
          </button>
        </div>

        {currentPeer && (
          <div className="settings-modal-section">
            <label className="form-label">{t('contactNameLabel')}</label>
            <p className="settings-modal-hint">{t('contactNameHint')}</p>
            <div className="settings-modal-name-row">
              <input
                type="text"
                className="form-input"
                placeholder={currentPeer.displayName || t('namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
              />
              <button type="button" className="btn-primary" onClick={handleSaveName}>
                {saved ? t('saved') : t('save')}
              </button>
            </div>
          </div>
        )}

        <div className="settings-modal-section">
          <label className="form-label">{t('chatBackground')}</label>
          <p className="settings-modal-hint">{t('chatBackgroundHint')}</p>
          <div className="settings-modal-presets">
            <button
              type="button"
              className={`settings-preset-tile ${!currentChatBackground ? 'active' : ''}`}
              onClick={() => handleBackground('')}
              title={t('noBackground')}
            >
              <span className="settings-preset-none">{t('noBackground')}</span>
            </button>
            {BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`settings-preset-tile ${currentChatBackground === preset.id ? 'active' : ''}`}
                style={preset.style}
                onClick={() => handleBackground(preset.id)}
                title={preset.label}
              />
            ))}
          </div>
          <div className="settings-modal-photo-bg">
            <div className="settings-modal-photo-bg-actions">
              <label className="settings-upload-label">
                <input
                  type="file"
                  accept="image/*"
                  className="settings-upload-input"
                  onChange={handlePhotoBackground}
                  disabled={bgUploading}
                />
                <span className="btn-secondary">{bgUploading ? t('uploading') : t('uploadPhoto')}</span>
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={handlePhotoBackgroundFromGallery}
                disabled={bgUploading}
              >
                {t('pickFromGallery')}
              </button>
            </div>
            {bgError && <p className="settings-modal-error">{bgError}</p>}
          </div>
        </div>

        {currentPeer && (
          <div className="settings-modal-section settings-modal-danger">
            <label className="form-label">{t('deleteChat')}</label>
            {!confirmAction ? (
              <>
                <button type="button" className="btn-secondary settings-btn-block" onClick={() => setConfirmAction('block')}>
                  {t('blockUser')}
                </button>
                <p className="settings-modal-hint-small">{t('blockUserHint')}</p>
                <button type="button" className="btn-secondary settings-btn-delete" onClick={() => setConfirmAction('delete')}>
                  {t('deleteChatWithHistory')}
                </button>
                <p className="settings-modal-hint-small">{t('deleteChatWithHistoryHint')}</p>
              </>
            ) : (
              <div className="settings-confirm">
                <p className="settings-modal-hint">
                  {confirmAction === 'block' ? t('confirmBlock') : t('confirmDeleteChat')}
                </p>
                {actionError && <p className="settings-modal-error">{actionError}</p>}
                <div className="settings-confirm-actions">
                  <button type="button" className="btn-secondary" onClick={() => { setConfirmAction(null); setActionError(null); }}>
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    className={confirmAction === 'block' ? 'btn-block-confirm' : 'btn-delete-confirm'}
                    onClick={confirmAction === 'block' ? handleBlock : handleDeleteChat}
                  >
                    {confirmAction === 'block' ? t('block') : t('delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
