import React, { useMemo } from 'react';
import { filterEmojiShortcodes } from './emojiShortcodes';
import { t } from './i18n';

/** Discord/Telegram :shortcode: autocomplete */
export default function EmojiSuggest({
  query,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}) {
  const items = useMemo(() => filterEmojiShortcodes(query, 8), [query]);
  if (!items.length) return null;

  return (
    <div className="emoji-suggest" role="listbox" aria-label={t('emojiSuggest')}>
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          className={`emoji-suggest-item${i === activeIndex ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          onMouseEnter={() => onActiveIndexChange?.(i)}
        >
          <span className="emoji-suggest-glyph" aria-hidden>{item.emoji}</span>
          <span className="emoji-suggest-code">:{item.id}:</span>
        </button>
      ))}
    </div>
  );
}
