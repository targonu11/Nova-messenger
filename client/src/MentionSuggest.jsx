import React, { useMemo } from 'react';
import { t } from './i18n';

/** Автодополнение @упоминаний как в Discord/Telegram */
export default function MentionSuggest({
  query,
  users,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  allowEveryone = false,
}) {
  const q = String(query || '').toLowerCase();
  const items = useMemo(() => {
    const list = [];
    if (allowEveryone && (!q || 'everyone'.startsWith(q))) {
      list.push({ id: '__everyone__', login: 'everyone', displayName: t('mentionEveryone'), special: true });
    }
    (users || []).forEach((u) => {
      if (!u?.login) return;
      const login = String(u.login).toLowerCase();
      const name = String(u.displayName || '').toLowerCase();
      if (!q || login.includes(q) || name.includes(q)) list.push(u);
    });
    return list.slice(0, 8);
  }, [users, q, allowEveryone]);

  if (!items.length) return null;

  return (
    <div className="mention-suggest" role="listbox" aria-label={t('mentionSuggest')}>
      {items.map((u, i) => (
        <button
          key={u.id || u.login}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          className={`mention-suggest-item${i === activeIndex ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(u);
          }}
          onMouseEnter={() => onActiveIndexChange?.(i)}
        >
          <span className="mention-suggest-at">@{u.login}</span>
          <span className="mention-suggest-name">{u.displayName || ''}</span>
        </button>
      ))}
    </div>
  );
}

export function getMentionQuery(text) {
  const m = String(text || '').match(/(?:^|[\s(])@([a-zA-Z0-9_]*)$/);
  return m ? m[1] : null;
}

export function insertMention(text, userLogin) {
  const src = String(text || '');
  const re = /@([a-zA-Z0-9_]*)$/;
  if (re.test(src)) return src.replace(re, `@${userLogin} `);
  return `${src}@${userLogin} `;
}
