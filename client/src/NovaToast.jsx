import React, { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { TOAST_EXIT_MS } from './novaMotion';



let showToastFn = null;



/** showNovaToast('Готово') | showNovaToast('!', { variant: 'celebrate', icon: '🎉' }) */

export function showNovaToast(text, iconOrOpts = '✓', msArg = 2400) {

  if (typeof iconOrOpts === 'object' && iconOrOpts !== null) {

    showToastFn?.({ text, ...iconOrOpts });

    return;

  }

  showToastFn?.({ text, icon: iconOrOpts, ms: msArg, variant: 'success' });

}



export function showNovaToastError(text, ms = 2600) {

  showToastFn?.({ text, icon: '✕', ms, variant: 'error' });

}



export function showNovaToastInfo(text, ms = 2400) {

  showToastFn?.({ text, icon: 'ℹ', ms, variant: 'info' });

}



export function showNovaToastCelebrate(text, ms = 3200) {

  showToastFn?.({ text, icon: '🎉', ms, variant: 'celebrate' });

}



export function NovaToastHost() {

  const [toasts, setToasts] = useState([]);



  useEffect(() => {

    showToastFn = ({ text, icon = '✓', ms = 2400, variant = 'success' }) => {

      const id = Date.now() + Math.random();

      setToasts((prev) => [...prev.slice(-2), { text, icon, variant, id, exiting: false }]);

      const exitAt = Math.max(ms - TOAST_EXIT_MS, TOAST_EXIT_MS);

      setTimeout(() => {

        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));

        setTimeout(() => {

          setToasts((prev) => prev.filter((t) => t.id !== id));

        }, TOAST_EXIT_MS);

      }, exitAt);

    };

    return () => { showToastFn = null; };

  }, []);



  if (!toasts.length) return null;

  return createPortal(

    <div className="nova-toast-stack" aria-live="polite">

      {toasts.map((toast) => (

        <div

          className={`nova-toast nova-toast--${toast.variant}${toast.exiting ? ' nova-toast--out' : ''}`}

          role="status"

          key={toast.id}

        >

          {toast.icon && <span className="nova-toast-icon" aria-hidden>{toast.icon}</span>}

          {toast.text}

        </div>

      ))}

    </div>,

    document.body

  );

}


