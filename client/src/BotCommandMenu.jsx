import React, { useEffect, useRef } from 'react';
import './BotCommandMenu.css';

export function filterBotCommands(commands, input) {
  if (!input.startsWith('/')) return [];
  const tail = input.slice(1);
  if (tail.includes(' ')) return [];
  const q = tail.toLowerCase();
  const list = commands || [];
  if (!q) return list;
  return list.filter((c) => String(c.command || '').toLowerCase().startsWith(q));
}

export default function BotCommandMenu({ commands, input, activeIndex, onSelect, onActiveIndexChange }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('.bot-command-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const filtered = filterBotCommands(commands, input);
  if (!filtered.length) return null;

  return (
    <div className="bot-command-menu" role="listbox" aria-label="Команды бота" ref={listRef}>
      {filtered.map((c, i) => (
        <button
          key={c.command}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          className={`bot-command-item${i === activeIndex ? ' active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onActiveIndexChange?.(i)}
          onClick={() => onSelect?.(c)}
        >
          <span className="bot-command-name">/{c.command}</span>
          <span className="bot-command-desc">{c.description}</span>
        </button>
      ))}
    </div>
  );
}
