import React from 'react';
import { avatarRingClass } from './avatarRings';

/** Обёртка с цветной обводкой вокруг круглого аватара */
export function AvatarRingWrap({ ring, size = 'md', className = '', children }) {
  const ringCls = avatarRingClass(ring);
  if (!ringCls) return children;
  const sizeMod = ['sm', 'md', 'lg', 'xl'].includes(size) ? size : 'md';
  return (
    <span className={`avatar-ring-wrap avatar-ring-wrap--${sizeMod} ${ringCls} ${className}`.trim()}>
      {children}
    </span>
  );
}
