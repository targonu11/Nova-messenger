import React from 'react';
import AnimatedOverlay from './AnimatedOverlay';
import { t } from './i18n';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], labelKey: 'shortcutQuickSwitcher' },
  { keys: ['Alt', '↑'], labelKey: 'shortcutSwitchChat' },
  { keys: ['Alt', '↓'], labelKey: 'shortcutSwitchChat' },
  { keys: ['?'], labelKey: 'shortcutShowHelp' },
  { keys: ['Ctrl', 'F'], labelKey: 'shortcutSearchInChat' },
  { keys: ['Esc'], labelKey: 'shortcutReplyCancel' },
  { keys: ['R'], labelKey: 'shortcutReply' },
  { keys: ['↑'], labelKey: 'shortcutReply' },
  { keys: [':'], labelKey: 'shortcutEmoji' },
  { keys: ['/'], labelKey: 'shortcutSlash' },
  { keys: ['Enter'], labelKey: 'shortcutSend' },
  { keys: ['Shift', 'Enter'], labelKey: 'shortcutNewLine' },
  { keys: ['2× tap'], labelKey: 'shortcutDoubleTapReact' },
  { keys: ['2× click'], labelKey: 'shortcutDoubleClickCopy' },
  { keys: ['Ctrl', 'Shift', 'R'], labelKey: 'shortcutHardRefresh' },
];

export default function KeyboardShortcutsModal({ onClose }) {
  return (
    <AnimatedOverlay onClose={onClose} className="keyboard-shortcuts-overlay">
      {({ close }) => (
        <div
          className="modal keyboard-shortcuts-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="keyboard-shortcuts-title"
        >
          <div className="keyboard-shortcuts-head">
            <h3 id="keyboard-shortcuts-title">{t('shortcutsTitle')}</h3>
            <p>{t('shortcutsHint')}</p>
          </div>
          <ul className="keyboard-shortcuts-list">
            {SHORTCUTS.map(({ keys, labelKey }) => (
              <li key={labelKey + keys.join('-')}>
                <span>{t(labelKey)}</span>
                <span className="keyboard-shortcuts-keys">
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="modal-actions" style={{ padding: '0 22px 18px' }}>
            <button type="button" className="btn-primary" onClick={close}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </AnimatedOverlay>
  );
}
