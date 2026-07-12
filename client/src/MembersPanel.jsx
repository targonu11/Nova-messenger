import React, { useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { t } from './i18n';
import './MembersPanel.css';

function roleLabel(role, t) {
  const r = String(role || 'member').toLowerCase();
  if (r === 'owner') return t('roleOwner');
  if (r === 'admin') return t('roleAdmin');
  return t('roleMember');
}

function nameColor(userId) {
  const colors = ['#ed4245', '#3ba55d', '#faa81a', '#5865f2', '#eb459e', '#57f287', '#00b0f4', '#f47b67'];
  const s = String(userId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

/** Discord-style members list for groups/channels */
export default function MembersPanel({
  open,
  onClose,
  members = [],
  presenceByUserId = {},
  currentUserId,
  onOpenUser,
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = [...(members || [])].sort((a, b) => {
      const ra = String(a.role || 'member');
      const rb = String(b.role || 'member');
      const rank = (r) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2);
      const d = rank(ra) - rank(rb);
      if (d !== 0) return d;
      return String(a.displayName || a.login || '').localeCompare(String(b.displayName || b.login || ''));
    });
    if (!query) return list;
    return list.filter((m) => {
      const hay = `${m.displayName || ''} ${m.login || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [members, q]);

  const online = filtered.filter((m) => presenceByUserId[String(m.id)]?.online);
  const offline = filtered.filter((m) => !presenceByUserId[String(m.id)]?.online);

  if (!open) return null;

  const renderRow = (m) => {
    const presence = presenceByUserId[String(m.id)];
    const isMe = String(m.id) === String(currentUserId);
    return (
      <button
        key={m.id}
        type="button"
        className="members-panel-row"
        onClick={() => onOpenUser?.(m)}
      >
        <Avatar
          path={m.avatarPath}
          userId={m.id}
          size="sm"
          presenceOnline={presence?.online === true ? true : presence?.online === false ? false : undefined}
        />
        <span className="members-panel-meta">
          <span className="members-panel-name" style={{ color: nameColor(m.id) }}>
            {m.displayName || m.login || '—'}
            {isMe ? ` (${t('you')})` : ''}
          </span>
          <span className="members-panel-role">{roleLabel(m.role, t)}</span>
        </span>
      </button>
    );
  };

  return (
    <aside className="members-panel" aria-label={t('membersPanel')}>
      <div className="members-panel-head">
        <h3>{t('membersPanel')} · {members.length}</h3>
        <button type="button" className="members-panel-close" onClick={onClose} aria-label={t('close')}>×</button>
      </div>
      <input
        className="members-panel-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('membersSearch')}
      />
      <div className="members-panel-body">
        {online.length > 0 && (
          <div className="members-panel-section">
            <div className="members-panel-section-title">{t('membersOnline')} — {online.length}</div>
            {online.map(renderRow)}
          </div>
        )}
        {offline.length > 0 && (
          <div className="members-panel-section">
            <div className="members-panel-section-title">{t('membersOffline')} — {offline.length}</div>
            {offline.map(renderRow)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="members-panel-empty">{t('noResults') || '—'}</p>
        )}
      </div>
    </aside>
  );
}

export { nameColor };
