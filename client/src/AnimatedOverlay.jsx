import React, { useState, useCallback } from 'react';
import { requestOverlayClose } from './novaMotion';

/** Модальный оверлей с плавным закрытием */
export default function AnimatedOverlay({ onClose, className = '', children }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => requestOverlayClose(setClosing, onClose), [onClose]);

  return (
    <div
      className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}${className ? ` ${className}` : ''}`}
      onClick={close}
    >
      {typeof children === 'function' ? children({ close }) : children}
    </div>
  );
}
