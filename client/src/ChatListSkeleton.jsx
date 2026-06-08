import React from 'react';

export default function ChatListSkeleton({ rows = 6 }) {
  return (
    <ul className="chat-list chat-list-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="skeleton-chat-item" style={{ animationDelay: `${i * 0.06}s` }}>
          <div className="skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line--short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
