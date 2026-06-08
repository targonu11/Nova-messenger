import React, { useState, useEffect, useMemo } from 'react';
import { getUserMutual, avatarUrl } from './api';
import { getProfileCoverStyle } from './profileCovers';
import { AvatarRingWrap } from './AvatarRingWrap';
import { useTranslation } from './i18n';
import { UserActivityOverlay } from './UserActivityOverlay';
import { IconChevronRight, IconHash, IconUsers } from './profileIcons';
import './ChatProfileTopPanel.css';

function formatMemberSince(ts, lang) {
  if (ts == null || !Number.isFinite(Number(ts))) return null;
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatLastSeen(lastSeenAt) {
  if (lastSeenAt == null || !Number.isFinite(Number(lastSeenAt))) return null;
  const d = new Date(Number(lastSeenAt) * 1000);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ChatDmProfilePanel({
  peer,
  currentUser,
  presence,
  displayName,
  isVerified,
  onViewFullProfile,
}) {
  const { t, lang } = useTranslation();
  const [mutual, setMutual] = useState({ mutualGroups: [], mutualFriends: [] });
  const [mutualLoading, setMutualLoading] = useState(false);
  const [openServers, setOpenServers] = useState(false);
  const [openFriends, setOpenFriends] = useState(false);

  const isSelf = Boolean(peer?.id && currentUser?.id && String(peer.id) === String(currentUser.id));

  useEffect(() => {
    if (!peer?.id || isSelf) {
      setMutual({ mutualGroups: [], mutualFriends: [] });
      return;
    }
    let cancelled = false;
    setMutualLoading(true);
    getUserMutual(peer.id)
      .then((d) => {
        if (cancelled) return;
        setMutual({
          mutualGroups: Array.isArray(d?.mutualGroups) ? d.mutualGroups : [],
          mutualFriends: Array.isArray(d?.mutualFriends) ? d.mutualFriends : [],
        });
      })
      .catch(() => {
        if (!cancelled) setMutual({ mutualGroups: [], mutualFriends: [] });
      })
      .finally(() => {
        if (!cancelled) setMutualLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [peer?.id, isSelf]);

  const memberSince = formatMemberSince(peer?.createdAt, lang);

  const presenceLine = useMemo(() => {
    if (!presence) return '';
    if (presence.online) return t('statusOnline');
    if (presence.hideLastSeen && presence.lastSeenAt == null) return t('statusLastSeenRecent');
    const fs = formatLastSeen(presence.lastSeenAt);
    return fs ? `${t('statusLastSeenWhen')} ${fs}` : t('statusLastSeenRecent');
  }, [presence, t]);

  const avatarSrc =
    avatarUrl(peer?.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(peer?.id || 'x')}`;

  const coverStyle = getProfileCoverStyle(peer?.coverPath, avatarUrl);

  return (
    <div className="chat-profile-top chat-profile-top--dm">
      <div
        className={`chat-profile-top-hero${coverStyle ? ' chat-profile-top-hero--has-cover profile-banner-animated' : ''}`}
        style={coverStyle || undefined}
      >
      {coverStyle && <div className="profile-banner-shimmer" aria-hidden />}
      <div className="chat-profile-top-inner">
        <AvatarRingWrap ring={peer?.avatarRing} size="lg">
          <img className="chat-profile-top-avatar" src={avatarSrc} alt="" />
        </AvatarRingWrap>
        <div className="chat-profile-top-main">
          <div className="chat-profile-top-heading">
            <h2 className="chat-profile-top-display">
              {displayName || peer?.displayName || '—'}
              {isVerified && <span className="verify-badge verify-badge-inline" title="Verified">✔</span>}
            </h2>
            {peer?.login && (
              <div className="chat-profile-top-login">@{peer.login}</div>
            )}
            {presenceLine && (
              <div
                className={`chat-profile-top-presence${presence?.online ? ' chat-profile-top-presence--online' : ''}`}
              >
                {presenceLine}
              </div>
            )}
            {presence?.online && presence?.activities?.length > 0 && (
              <UserActivityOverlay activities={presence.activities} t={t} compact />
            )}
          </div>

          {isSelf && <p className="chat-profile-top-hint">{t('chatProfileSavedHint')}</p>}

          {memberSince && (
            <div className="chat-profile-top-block">
              <span className="chat-profile-top-block-label">{t('chatProfileMemberSince')}</span>
              <span className="chat-profile-top-block-value">{memberSince}</span>
            </div>
          )}

          {!isSelf && (
            <div className="chat-profile-top-accordions">
              <button
                type="button"
                className="chat-profile-top-acc-row"
                onClick={() => setOpenServers((v) => !v)}
                disabled={mutualLoading}
              >
                <span className="chat-profile-top-acc-label">
                  <IconHash size={16} />
                  {t('chatProfileMutualServers')} — {mutual.mutualGroups.length}
                </span>
                <IconChevronRight className={`chat-profile-top-chevron ${openServers ? 'open' : ''}`} />
              </button>
              {openServers && mutual.mutualGroups.length > 0 && (
                <ul className="chat-profile-top-acc-list">
                  {mutual.mutualGroups.map((g) => (
                    <li key={g.id}>{g.name}</li>
                  ))}
                </ul>
              )}
              {openServers && !mutualLoading && mutual.mutualGroups.length === 0 && (
                <div className="chat-profile-top-acc-empty">—</div>
              )}

              <button
                type="button"
                className="chat-profile-top-acc-row"
                onClick={() => setOpenFriends((v) => !v)}
                disabled={mutualLoading}
              >
                <span className="chat-profile-top-acc-label">
                  <IconUsers size={16} />
                  {t('chatProfileMutualFriends')} — {mutual.mutualFriends.length}
                </span>
                <IconChevronRight className={`chat-profile-top-chevron ${openFriends ? 'open' : ''}`} />
              </button>
              {openFriends && mutual.mutualFriends.length > 0 && (
                <ul className="chat-profile-top-acc-list">
                  {mutual.mutualFriends.map((u) => (
                    <li key={u.id}>
                      {u.displayName}
                      <span className="chat-profile-top-acc-login"> @{u.login}</span>
                    </li>
                  ))}
                </ul>
              )}
              {openFriends && !mutualLoading && mutual.mutualFriends.length === 0 && (
                <div className="chat-profile-top-acc-empty">—</div>
              )}
            </div>
          )}

          <button type="button" className="chat-profile-top-fullprofile" onClick={onViewFullProfile}>
            {t('chatProfileViewFull')}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

export function ChatGroupProfilePanel({ peer, memberCount, onOpenGroupSettings }) {
  const { t, lang } = useTranslation();
  const isChannel = peer?.kind === 'channel' || Boolean(peer?.serverId);
  const created = formatMemberSince(peer?.createdAt, lang);
  const avatarSrc = peer?.avatarPath ? avatarUrl(peer.avatarPath) : null;

  return (
    <div className={`chat-profile-top chat-profile-top--group${isChannel ? ' chat-profile-top--channel' : ''}`}>
      <div className={`chat-profile-top-banner chat-profile-top-banner--group${isChannel ? ' chat-profile-top-banner--channel' : ''}`} aria-hidden />
      <div className="chat-profile-top-inner chat-profile-top-inner--group">
        {avatarSrc ? (
          <img className="chat-profile-top-avatar chat-profile-top-avatar--group" src={avatarSrc} alt="" />
        ) : (
          <div className="chat-profile-top-group-icon" aria-hidden>
            <IconHash size={36} />
          </div>
        )}
        <div className="chat-profile-top-main">
          <h2 className="chat-profile-top-display">{isChannel ? `# ${peer?.name || '—'}` : (peer?.name || '—')}</h2>
          {isChannel && peer?.description && (
            <p className="chat-profile-top-channel-desc">{peer.description}</p>
          )}
          <div className="chat-profile-top-meta-row">
            {typeof memberCount === 'number' && (
              <span>
                {memberCount} {isChannel ? t('chatProfileChannelMembers') : t('chatProfileGroupMembers')}
              </span>
            )}
            {created && (
              <span className="chat-profile-top-meta-sep">
                {t('chatProfileGroupCreated')} {created}
              </span>
            )}
          </div>
          {isChannel && (
            <p className="chat-profile-top-channel-badge">{t('channelInfoHint')}</p>
          )}
          <button type="button" className="chat-profile-top-fullprofile" onClick={onOpenGroupSettings}>
            {isChannel ? t('chatProfileChannelSettings') : t('chatProfileGroupSettings')}
          </button>
        </div>
      </div>
    </div>
  );
}
