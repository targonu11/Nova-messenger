import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from './i18n';
import { Avatar } from './Avatar';
import './QuickSwitcher.css';

/** Discord-style Ctrl+K quick chat switcher */
export default function QuickSwitcher({
  open,
  onClose,
  recentChats = [],
  users = [],
  groups = [],
  onSelect,
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setActive(0);
    const tmr = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(tmr);
  }, [open]);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/^@+/, '');
    const seen = new Set();
    const out = [];
    const push = (item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    recentChats.forEach((c) => {
      push({
        type: c.type,
        id: c.id,
        title: c.name || c.login || 'Chat',
        subtitle: c.type === 'group' ? t('groups') : (c.login ? `@${c.login}` : t('folderUsers')),
        avatarPath: c.avatarPath,
        recent: true,
      });
    });
    users.forEach((u) => {
      push({
        type: 'user',
        id: u.id,
        title: u.displayName || u.login,
        subtitle: u.login ? `@${u.login}` : '',
        avatarPath: u.avatarPath,
      });
    });
    groups.forEach((g) => {
      push({
        type: 'group',
        id: g.id,
        title: g.name,
        subtitle: g.kind === 'channel' ? '# channel' : t('groups'),
        avatarPath: g.avatarPath,
      });
    });

    if (!query) return out.slice(0, 12);
    return out
      .filter((item) => {
        const hay = `${item.title} ${item.subtitle}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 12);
  }, [q, recentChats, users, groups]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const pick = (item) => {
    if (!item) return;
    onSelect?.({ type: item.type, id: item.id });
    onClose?.();
  };

  return (
    <div className="modal-overlay quick-switcher-overlay" role="presentation" onClick={onClose}>
      <div
        className="quick-switcher"
        role="dialog"
        aria-modal="true"
        aria-label={t('quickSwitcher')}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-switcher-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('quickSwitcherHint')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose?.();
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              pick(items[active] || items[0]);
            }
          }}
        />
        <ul className="quick-switcher-list" role="listbox">
          {items.length === 0 ? (
            <li className="quick-switcher-empty">{t('noRecentChats')}</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`quick-switcher-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item)}
                >
                  {item.type === 'user' ? (
                    <Avatar path={item.avatarPath} userId={item.id} size="sm" />
                  ) : (
                    <span className="quick-switcher-hash">#</span>
                  )}
                  <span className="quick-switcher-meta">
                    <span className="quick-switcher-title">{item.title}</span>
                    <span className="quick-switcher-sub">{item.subtitle}</span>
                  </span>
                  {item.recent ? <span className="quick-switcher-badge">{t('folderAll')}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="quick-switcher-foot">
          <kbd>↑↓</kbd> <span>{t('quickSwitcherNav')}</span>
          <kbd>Enter</kbd> <span>{t('quickSwitcherOpen')}</span>
          <kbd>Esc</kbd>
        </div>
      </div>
    </div>
  );
}
