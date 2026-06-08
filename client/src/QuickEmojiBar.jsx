import React from 'react';

export const QUICK_INPUT_EMOJI = ['😀', '👍', '❤️', '🔥', '😂', '🎉', '👀', '💯', '✨', '🙏'];

export default function QuickEmojiBar({ onPick, className = '' }) {
  return (
    <div className={`chat-quick-emoji-bar${className ? ` ${className}` : ''}`} role="toolbar" aria-label="Quick emoji">
      {QUICK_INPUT_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="chat-quick-emoji-btn"
          title={emoji}
          aria-label={emoji}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
