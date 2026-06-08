import React, { useState, useCallback } from 'react';
import { Avatar } from './Avatar';
import { t } from './i18n';
import './NotificationPanel.css';

export default function NotificationPanel({ notifications, onDismiss, onDismissAll, onSelect }) {
  const [exitingIds, setExitingIds] = useState(() => new Set());

  const dismissWithAnim = useCallback((id) => {
    setExitingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      onDismiss?.(id);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 220);
  }, [onDismiss]);

  if (!notifications || notifications.length === 0) return null;

  const truncate = (str, max = 60) => {
    if (!str || typeof str !== 'string') return '';
    return str.length <= max ? str : str.slice(0, max).trim() + '…';
  };

  return (
    <div className="notification-panel" role="region" aria-label={t('notifications')}>
      <div className="notification-panel-header">
        <button type="button" className="notification-panel-hide-all" onClick={onDismissAll}>
          {t('hideAll')}
        </button>
      </div>
      <ul className="notification-panel-list">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`notification-panel-item${exitingIds.has(n.id) ? ' notification-panel-item--out' : ''}`}
          >
            <button
              type="button"
              className="notification-panel-item-inner"
              onClick={() => onSelect?.(n)}
            >
              <span className="notification-panel-avatar">
                {n.type === 'group' ? (
                  <span className="notification-panel-group-icon">#</span>
                ) : (
                  <Avatar path={n.avatarPath} userId={n.chatId} size="sm" />
                )}
              </span>
              <div className="notification-panel-body">
                <span className="notification-panel-name">{n.chatName}</span>
                <span className="notification-panel-preview">
                  {n.type === 'group' && n.senderName
                    ? `${n.senderName}: ${truncate(n.content)}`
                    : truncate(n.content)}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="notification-panel-dismiss"
              onClick={(e) => { e.stopPropagation(); dismissWithAnim(n.id); }}
              aria-label={t('close')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
