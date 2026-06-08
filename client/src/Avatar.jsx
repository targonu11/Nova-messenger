import React, { useState } from 'react';
import { avatarUrl } from './api';
import { AvatarRingWrap } from './AvatarRingWrap';

const PLACEHOLDER_SVG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#444"/><circle cx="50" cy="38" r="18" fill="#666"/><ellipse cx="50" cy="88" rx="30" ry="22" fill="#666"/></svg>'
);

export function Avatar({
  path,
  userId,
  size = 'sm',
  alt = '',
  className = '',
  onClick,
  presenceOnline,
  presenceMode,
  ring,
}) {
  const [failedCount, setFailedCount] = useState(0);
  const url = failedCount === 0 ? avatarUrl(path) : null;
  const fallback =
    failedCount === 0 ? null
    : failedCount === 1 && userId
      ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
      : PLACEHOLDER_SVG;
  const src = url || fallback || PLACEHOLDER_SVG;

  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'xl' ? 'avatar-xl' : size === 'md' ? 'avatar' : 'avatar-sm';
  const combinedClass = [sizeClass, className].filter(Boolean).join(' ');

  const img = (
    <img
      className={combinedClass}
      src={src}
      alt={alt}
      onError={() => setFailedCount((c) => Math.min(c + 1, 2))}
      onClick={onClick}
    />
  );

  let inner = img;
  if (typeof presenceOnline === 'boolean') {
    const dotKind = !presenceOnline
      ? 'offline'
      : presenceMode === 'dnd'
        ? 'dnd'
        : presenceMode === 'idle'
          ? 'idle'
          : 'online';
    inner = (
      <span className={`avatar-with-presence avatar-with-presence--${size}`}>
        {img}
        <span
          className={`avatar-presence-dot avatar-presence-dot--${dotKind}`}
          title={presenceOnline ? (presenceMode === 'dnd' ? 'Не беспокоить' : presenceMode === 'idle' ? 'Неактивен' : 'В сети') : 'Не в сети'}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <AvatarRingWrap ring={ring} size={size}>
      {inner}
    </AvatarRingWrap>
  );
}
