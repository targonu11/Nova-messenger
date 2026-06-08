import React, { useEffect, useState } from 'react';
import { deleteServer, getServer, leaveServer, updateServer } from './api';
import AnimatedOverlay from './AnimatedOverlay';
import { useTranslation } from './i18n';
import './ServerSettingsModal.css';

export default function ServerSettingsModal({ serverId, onClose, onUpdated }) {
  const { t } = useTranslation();
  const [server, setServer] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    getServer(serverId)
      .then((s) => {
        setServer(s);
        setName(s.name || '');
      })
      .catch((e) => setError(e.message || t('serverLoadFailed')))
      .finally(() => setLoading(false));
  }, [serverId, t]);

  const isAdmin = server?.myRole === 'admin';

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('serverNameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateServer(serverId, name.trim());
      if (onUpdated) await onUpdated();
      onClose();
    } catch (e) {
      setError(e.message || t('serverSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm(t('serverLeaveConfirm'))) return;
    setLeaving(true);
    setError('');
    try {
      await leaveServer(serverId);
      if (onUpdated) await onUpdated();
      onClose();
    } catch (e) {
      setError(e.message || t('serverLeaveFailed'));
    } finally {
      setLeaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await deleteServer(serverId);
      if (onUpdated) await onUpdated();
      onClose();
    } catch (e) {
      setError(e.message || t('serverDeleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedOverlay onClose={onClose}>
      {({ close }) => (
      <div className="modal server-settings" onClick={(e) => e.stopPropagation()}>
        <div className="server-settings-header">
          <h2>{t('serverSettingsTitle')}</h2>
          <button type="button" className="btn-icon-close" onClick={close} aria-label={t('close')}>
            <span className="icon-close">×</span>
          </button>
        </div>

        {loading ? (
          <p className="nav-loading">{t('loading')}</p>
        ) : (
          <div className="server-settings-body">
            <div className="server-settings-stats">
              <span>{t('serverChannelsCount')}: {server?.channelCount ?? 0}</span>
              <span>{t('serverMembersCount')}: {server?.memberCount ?? 0}</span>
            </div>

            {isAdmin && (
              <div className="form-field">
                <label className="form-label">{t('serverNameLabel')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                />
              </div>
            )}

            {!isAdmin && (
              <p className="server-settings-readonly-name">{server?.name}</p>
            )}

            {error && <p className="modal-error">{error}</p>}

            {isAdmin && (
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={close} disabled={saving}>
                  {t('profileCancel')}
                </button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? t('profileSaving') : t('profileSave')}
                </button>
              </div>
            )}

            <div className="server-settings-danger">
              <button type="button" className="btn-secondary" onClick={handleLeave} disabled={leaving}>
                {leaving ? t('profileSaving') : t('serverLeave')}
              </button>
              {isAdmin && (
                <>
                  {!deleteConfirm ? (
                    <button type="button" className="btn-delete-group" onClick={handleDelete}>
                      {t('serverDelete')}
                    </button>
                  ) : (
                    <div className="delete-confirm">
                      <span>{t('serverDeleteConfirm')}</span>
                      <button type="button" className="btn-confirm-delete" onClick={handleDelete} disabled={saving}>
                        {t('serverDeleteYes')}
                      </button>
                      <button type="button" className="btn-cancel-delete" onClick={() => setDeleteConfirm(false)}>
                        {t('profileCancel')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </AnimatedOverlay>
  );
}
