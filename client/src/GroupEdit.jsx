import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { getGroup, getGroupMembers, getUsers, updateGroup, uploadGroupAvatar, uploadGroupBackground, clearGroupBackground, addGroupMembers, removeGroupMember, changeMemberRole, deleteGroup, avatarUrl, getChannelInviteLink } from './api';
import { BACKGROUND_PRESETS } from './groupBackgrounds';
import { isChannelGroup } from './groupUtils';
import { useTranslation } from './i18n';
import AnimatedOverlay from './AnimatedOverlay';
import './GroupEdit.css';

export default function GroupEdit({ groupId, onClose, onUpdated }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slowModeSec, setSlowModeSec] = useState(0);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [postAsChannel, setPostAsChannel] = useState(true);
  const [allowForward, setAllowForward] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'members' | 'settings' | 'appearance'
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const backgroundInputRef = useRef(null);

  useEffect(() => {
    if (groupId) {
      loadData();
    }
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      let groupData;
      let membersData = [];
      let usersData = [];
      try {
        groupData = await getGroup(groupId);
      } catch (err) {
        throw new Error('Failed to load group: ' + (err.message || 'Unknown error'));
      }
      try {
        membersData = await getGroupMembers(groupId);
      } catch {
        membersData = [];
      }
      try {
        usersData = await getUsers();
      } catch {
        usersData = [];
      }
      setGroup(groupData);
      setName(groupData.name || '');
      setDescription(groupData.description || '');
      setSlowModeSec(Number(groupData.slowModeSec) || 0);
      setReactionsEnabled(groupData.reactionsEnabled !== false);
      setPostAsChannel(groupData.postAsChannel !== false);
      setAllowForward(groupData.allowForward !== false);
      setAllowCopy(groupData.allowCopy !== false);
      setInviteCode(groupData.inviteCode || '');
      setMembers(membersData);
      setAllUsers(usersData.filter((u) => !membersData.some((m) => m.id === u.id)));
    } catch (err) {
      setError(err.message || 'Failed to load group data');
    } finally {
      setLoading(false);
    }
  };

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
    
    setAvatarFile(file);
    setError('');
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const isAdmin = group?.userRole === 'admin';
  const isChannel = isChannelGroup(group);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(isChannel ? t('channelNameRequired') : t('groupNameRequired'));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const channelSettings = isChannel
        ? { description: description.trim(), slowModeSec, reactionsEnabled, postAsChannel, allowForward, allowCopy }
        : undefined;
      const nameChanged = name.trim() !== group.name;
      if (nameChanged || channelSettings) {
        await updateGroup(
          groupId,
          nameChanged ? name.trim() : undefined,
          undefined,
          channelSettings
        );
      }

      if (avatarFile) {
        await uploadGroupAvatar(groupId, avatarFile);
      }

      if (onUpdated) {
        await onUpdated();
      }
      onClose();
    } catch (err) {
      setError(err.message || t('groupSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMembers = async (userIds) => {
    try {
      await addGroupMembers(groupId, userIds);
      await loadData();
    } catch (err) {
      setError(err.message || 'Не удалось добавить участников');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm(isChannel ? t('channelRemoveSubscriberConfirm') : t('groupRemoveMemberConfirm'))) return;
    
    try {
      await removeGroupMember(groupId, userId);
      await loadData();
    } catch (err) {
      setError(err.message || 'Не удалось удалить участника');
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await changeMemberRole(groupId, userId, newRole);
      await loadData();
    } catch (err) {
      setError(err.message || 'Не удалось изменить роль');
    }
  };

  const handleBackgroundPreset = async (presetId) => {
    if (!isAdmin) return;
    setBackgroundSaving(true);
    setError('');
    try {
      await updateGroup(groupId, undefined, presetId);
      setGroup((g) => (g ? { ...g, backgroundPath: presetId } : g));
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Не удалось изменить фон');
    } finally {
      setBackgroundSaving(false);
    }
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите файл изображения');
      return;
    }
    setBackgroundSaving(true);
    setError('');
    try {
      const data = await uploadGroupBackground(groupId, file);
      setGroup((g) => (g ? { ...g, backgroundPath: data.backgroundPath } : g));
      setBackgroundFile(null);
      if (backgroundInputRef.current) backgroundInputRef.current.value = '';
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Не удалось загрузить фон');
    } finally {
      setBackgroundSaving(false);
    }
  };

  const handleClearBackground = async () => {
    if (!isAdmin) return;
    setBackgroundSaving(true);
    setError('');
    try {
      await clearGroupBackground(groupId);
      setGroup((g) => (g ? { ...g, backgroundPath: null } : g));
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Не удалось убрать фон');
    } finally {
      setBackgroundSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteConfirm || !isAdmin) return;
    setDeleting(true);
    setError('');
    try {
      await deleteGroup(groupId);
      if (onUpdated) await onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Не удалось удалить группу');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveChannelSettings = async () => {
    if (!isAdmin || !isChannel) return;
    setSaving(true);
    setError('');
    try {
      await updateGroup(groupId, undefined, undefined, {
        description: description.trim(),
        slowModeSec,
        reactionsEnabled,
        postAsChannel,
        allowForward,
        allowCopy,
      });
      if (onUpdated) await onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || t('groupSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadInviteLink = async (regenerate = false) => {
    if (!isAdmin || !isChannel) return;
    setInviteLoading(true);
    setError('');
    try {
      const data = await getChannelInviteLink(groupId, regenerate);
      setInviteCode(data.inviteCode || '');
    } catch (err) {
      setError(err.message || t('channelInviteFailed'));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    let code = inviteCode;
    if (!code) {
      try {
        const data = await getChannelInviteLink(groupId, false);
        code = data.inviteCode || '';
        setInviteCode(code);
      } catch (err) {
        setError(err.message || t('channelInviteFailed'));
        return;
      }
    }
    const link = `${window.location.origin}${window.location.pathname || ''}#join-${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(code);
        setInviteCopied(true);
        window.setTimeout(() => setInviteCopied(false), 2000);
      } catch {
        setError(t('channelInviteCopyFailed'));
      }
    }
  };

  const currentAvatar = avatarPreview || avatarUrl(group?.avatarPath) || null;

  useEffect(() => {
    if (!isAdmin && (activeTab === 'appearance' || activeTab === 'settings')) setActiveTab('info');
  }, [isAdmin, activeTab]);

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal group-edit" onClick={(e) => e.stopPropagation()}>
          <p className="nav-loading">Загрузка…</p>
        </div>
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal group-edit" onClick={(e) => e.stopPropagation()}>
          <div className="group-edit-header">
            <h2>Настройки группы</h2>
            <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Закрыть">
              <span className="icon-close">×</span>
            </button>
          </div>
          <p className="modal-error">{error}</p>
          <button type="button" className="btn-primary" onClick={loadData}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const searchLower = search.trim().toLowerCase();
  const filteredUsers = searchLower
    ? allUsers.filter(
        (u) =>
          (u.displayName || '').toLowerCase().includes(searchLower) ||
          (u.login || '').toLowerCase().includes(searchLower)
      )
    : [];

  return (
    <AnimatedOverlay onClose={onClose}>
      {({ close }) => (
      <div className="modal group-edit" onClick={(e) => e.stopPropagation()}>
        <div className="group-edit-header">
          <h2>{isChannel ? t('channelSettingsTitle') : t('groupSettingsTitle')}</h2>
          <button type="button" className="btn-icon-close" onClick={close} aria-label={t('close')}>
            <span className="icon-close">×</span>
          </button>
        </div>

        <div className="group-edit-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            {t('groupTabInfo')}
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            {t('groupTabMembers')} ({members.length})
          </button>
          {isAdmin && isChannel && (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              {t('channelTabSettings')}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              {t('groupTabAppearance')}
            </button>
          )}
        </div>

        <div className="group-edit-tab-content" key={activeTab}>
        {activeTab === 'info' && (
          <div className="group-edit-content">
            <div className="group-edit-avatar-section">
              <div className="group-avatar-preview">
                {currentAvatar ? (
                  <img className="avatar-lg" src={currentAvatar} alt="" />
                ) : (
                  <div className="avatar-placeholder">{isChannel ? '#' : '👥'}</div>
                )}
                {isAdmin && (
                  <label className="avatar-change-btn" title="Сменить аватар">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      style={{ display: 'none' }}
                    />
                    <span className="icon-camera" />
                  </label>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="btn-avatar-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarFile ? 'Заменить фото' : 'Выбрать фото'}
                </button>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">{isChannel ? t('channelNameLabel') : t('groupNameLabel')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={isChannel ? t('channelNamePlaceholder') : t('groupNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                maxLength={50}
                required
              />
            </div>

            {isChannel && (
              <div className="form-field">
                <label className="form-label">{t('channelDescriptionLabel')}</label>
                <textarea
                  className="form-textarea"
                  placeholder={t('channelDescriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                  maxLength={500}
                  rows={3}
                />
              </div>
            )}

            {isChannel && (
              <p className="group-edit-hint">{t('channelInfoHint')}</p>
            )}

            {error && <p className="modal-error">{error}</p>}

            {isAdmin && (
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                  {t('profileCancel')}
                </button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? t('profileSaving') : t('profileSave')}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="group-edit-content">
            {isAdmin && (
              <div className="add-members-section">
                <label className="form-label">{isChannel ? t('channelAddSubscribers') : t('groupAddMembers')}</label>
                <input
                  type="text"
                  className="member-search"
                  placeholder="Поиск по username (например, @lololowkid) или имени"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search.trim() && filteredUsers.length > 0 && (
                  <ul className="member-pick-list">
                    {filteredUsers.map((u) => (
                      <li
                        key={u.id}
                        onClick={() => {
                          handleAddMembers([u.id]);
                          setSearch('');
                        }}
                      >
                        <img className="avatar-sm" src={avatarUrl(u.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" />
                        <div className="member-info">
                          <span className="member-name">{u.displayName}</span>
                          <span className="member-login">@{u.login}</span>
                        </div>
                        <span className="add-icon">+</span>
                      </li>
                    ))}
                  </ul>
                )}
                {search.trim() && filteredUsers.length === 0 && (
                  <p className="modal-hint">Пользователи не найдены</p>
                )}
              </div>
            )}

            <div className="members-list-section">
              <label className="form-label">
                {isChannel ? `${t('channelSubscribersLabel')} (${members.length})` : `${t('groupTabMembers')} (${members.length})`}
              </label>
              <ul className="members-list">
                {members.map((m) => (
                  <li key={m.id} className="member-item">
                    <img className="avatar-sm" src={avatarUrl(m.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.id}`} alt="" />
                    <div className="member-info">
                      <span className="member-name">{m.displayName}</span>
                      <span className="member-login">@{m.login}</span>
                    </div>
                    <div className="member-actions">
                      {isAdmin && m.id !== user.id && (
                        <select
                          className="role-select"
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        >
                          <option value="member">{isChannel ? t('channelRoleSubscriber') : t('groupRoleMember')}</option>
                          <option value="admin">{isChannel ? t('channelRolePublisher') : t('groupRoleAdmin')}</option>
                        </select>
                      )}
                      {m.role === 'admin' && (
                        <span className="role-badge admin">{isChannel ? t('channelRolePublisher') : t('groupRoleAdmin')}</span>
                      )}
                      {!isAdmin && m.role !== 'admin' && (
                        <span className="role-badge">{isChannel ? t('channelRoleSubscriber') : t('groupRoleMember')}</span>
                      )}
                      {isAdmin && m.id !== user.id && (
                        <button
                          type="button"
                          className="btn-remove-member"
                          onClick={() => handleRemoveMember(m.id)}
                          title="Удалить участника"
                        >
                          ×
                        </button>
                      )}
                      {!isAdmin && m.id === user.id && (
                        <button
                          type="button"
                          className="btn-remove-member btn-leave"
                          onClick={() => handleRemoveMember(m.id)}
                          title="Выйти из группы"
                        >
                          Выйти
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {error && <p className="modal-error">{error}</p>}
          </div>
        )}

        {isAdmin && isChannel && activeTab === 'settings' && (
          <div className="group-edit-content">
            <div className="form-field">
              <label className="form-label">{t('channelSlowModeLabel')}</label>
              <p className="group-edit-hint">{t('channelSlowModeHint')}</p>
              <select
                className="form-input"
                value={slowModeSec}
                onChange={(e) => setSlowModeSec(Number(e.target.value))}
              >
                <option value={0}>{t('channelSlowModeOff')}</option>
                <option value={5}>5 {t('channelSlowModeSec')}</option>
                <option value={10}>10 {t('channelSlowModeSec')}</option>
                <option value={30}>30 {t('channelSlowModeSec')}</option>
                <option value={60}>60 {t('channelSlowModeSec')}</option>
                <option value={300}>5 {t('channelSlowModeMin')}</option>
              </select>
            </div>

            <label className="channel-setting-toggle">
              <input
                type="checkbox"
                checked={reactionsEnabled}
                onChange={(e) => setReactionsEnabled(e.target.checked)}
              />
              <span>{t('channelReactionsLabel')}</span>
            </label>
            <p className="group-edit-hint">{t('channelReactionsHint')}</p>

            <label className="channel-setting-toggle">
              <input
                type="checkbox"
                checked={postAsChannel}
                onChange={(e) => setPostAsChannel(e.target.checked)}
              />
              <span>{t('channelPostAsChannelLabel')}</span>
            </label>
            <p className="group-edit-hint">{t('channelPostAsChannelHint')}</p>

            <label className="channel-setting-toggle">
              <input
                type="checkbox"
                checked={allowForward}
                onChange={(e) => setAllowForward(e.target.checked)}
              />
              <span>{t('channelAllowForwardLabel')}</span>
            </label>
            <p className="group-edit-hint">{t('channelAllowForwardHint')}</p>

            <label className="channel-setting-toggle">
              <input
                type="checkbox"
                checked={allowCopy}
                onChange={(e) => setAllowCopy(e.target.checked)}
              />
              <span>{t('channelAllowCopyLabel')}</span>
            </label>
            <p className="group-edit-hint">{t('channelAllowCopyHint')}</p>

            <div className="channel-invite-section">
              <label className="form-label">{t('channelInviteLinkLabel')}</label>
              <p className="group-edit-hint">{t('channelInviteLinkHint')}</p>
              <div className="channel-invite-row">
                <input
                  type="text"
                  className="form-input channel-invite-input"
                  readOnly
                  value={inviteCode || t('channelInviteNotGenerated')}
                  placeholder={t('channelInviteNotGenerated')}
                />
                <button type="button" className="btn-secondary" onClick={() => handleLoadInviteLink(false)} disabled={inviteLoading}>
                  {inviteLoading ? '…' : t('channelInviteGenerate')}
                </button>
              </div>
              <div className="channel-invite-actions">
                <button type="button" className="btn-secondary" onClick={handleCopyInviteLink} disabled={!inviteCode && !inviteLoading}>
                  {inviteCopied ? t('channelInviteCopied') : t('channelInviteCopy')}
                </button>
                <button type="button" className="btn-secondary btn-danger-soft" onClick={() => handleLoadInviteLink(true)} disabled={inviteLoading}>
                  {t('channelInviteRegenerate')}
                </button>
              </div>
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                {t('profileCancel')}
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveChannelSettings} disabled={saving}>
                {saving ? t('profileSaving') : t('profileSave')}
              </button>
            </div>
          </div>
        )}

        {isAdmin && activeTab === 'appearance' && (
          <div className="group-edit-content">
            <div className="group-edit-section">
              <label className="form-label">{t('chatBackground')}</label>
              <p className="group-edit-hint">{t('groupBackgroundHelp')}</p>
              <div className="background-presets">
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`background-preset-tile ${group?.backgroundPath === preset.id ? 'active' : ''}`}
                    style={preset.style}
                    onClick={() => handleBackgroundPreset(preset.id)}
                    disabled={!isAdmin || backgroundSaving}
                    title={preset.label}
                  />
                ))}
              </div>
              {isAdmin && (
                <>
                  <label className="btn-upload-background">
                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundUpload}
                      style={{ display: 'none' }}
                    />
                    {t('groupUploadBackground')}
                  </label>
                  {group?.backgroundPath && !group.backgroundPath.startsWith('preset:') && (
                    <button
                      type="button"
                      className="btn-clear-background"
                      onClick={handleClearBackground}
                      disabled={backgroundSaving}
                    >
                      {t('groupClearBackground')}
                    </button>
                  )}
                </>
              )}
            </div>

            {isAdmin && (
              <div className="group-edit-danger">
                <label className="form-label">{t('dangerZone')}</label>
                <p className="group-edit-hint">
                  {isChannel ? t('channelDeleteHint') : t('groupDeleteHint')}
                </p>
                {!deleteConfirm ? (
                  <button
                    type="button"
                    className="btn-delete-group"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    {isChannel ? t('channelDelete') : t('groupDelete')}
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <span>Точно удалить?</span>
                    <button type="button" className="btn-confirm-delete" onClick={handleDeleteGroup} disabled={deleting}>
                      {deleting ? 'Удаление…' : 'Да, удалить'}
                    </button>
                    <button type="button" className="btn-cancel-delete" onClick={() => setDeleteConfirm(false)}>
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && <p className="modal-error">{error}</p>}
          </div>
        )}
        </div>
      </div>
      )}
    </AnimatedOverlay>
  );
}
