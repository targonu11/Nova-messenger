import React, { useState } from 'react';
import { MESSAGE_FX, CHAT_MOODS, pickRandomFx } from './messageFx';
import { t } from './i18n';

export default function MessageFxBar({ activeFx, onSelect, sticky, onToggleSticky, mood, onMood }) {
  const [spinning, setSpinning] = useState(false);

  const roll = () => {
    if (spinning) return;
    setSpinning(true);
    const picked = pickRandomFx();
    window.setTimeout(() => {
      onSelect(picked);
      setSpinning(false);
    }, 520);
  };

  return (
    <div className="message-fx-wrap">
      <div className="message-fx-moods" role="toolbar" aria-label={t('imbaMood')}>
        {CHAT_MOODS.map((m) => (
          <button
            key={String(m.id)}
            type="button"
            className={`message-fx-mood-btn${mood === m.id ? ' active' : ''}`}
            title={m.label}
            onClick={() => onMood(m.id)}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      <div className="message-fx-bar" role="toolbar" aria-label={t('imbaFxBar')}>
        <button
          type="button"
          className={`message-fx-btn message-fx-btn--roulette${spinning ? ' spinning' : ''}`}
          title={t('imbaRoulette')}
          onClick={roll}
        >
          🎰
        </button>
        <button
          type="button"
          className={`message-fx-btn message-fx-btn--lock${sticky ? ' active' : ''}`}
          title={t('imbaSticky')}
          aria-pressed={!!sticky}
          onClick={onToggleSticky}
        >
          📌
        </button>
        {MESSAGE_FX.map((fx, i) => (
          <button
            key={fx.id}
            type="button"
            className={`message-fx-btn${activeFx === fx.id ? ' active' : ''}`}
            title={`${fx.label} (${fx.slash})${i < 9 ? ` · Alt+${i + 1}` : ''}`}
            aria-pressed={activeFx === fx.id}
            onClick={() => onSelect(activeFx === fx.id ? null : fx.id)}
          >
            {fx.emoji}
            {i < 9 ? <span className="message-fx-hotkey-hint">{i + 1}</span> : null}
          </button>
        ))}
      </div>
      {activeFx && (
        <div className="message-fx-hint">
          {t('imbaFxHint').replace('{fx}', MESSAGE_FX.find((f) => f.id === activeFx)?.label || activeFx)}
          {sticky ? ` · ${t('imbaStickyOn')}` : ''}
        </div>
      )}
    </div>
  );
}
