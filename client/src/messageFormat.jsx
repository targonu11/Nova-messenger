import React, { useState } from 'react';

/** @mention только после начала строки, пробела или «(» — чтобы не ловить email вида a@b.com */
const MENTION_RE = /(^|[\s(])@([a-zA-Z0-9_]+)/g;

function findUserByLogin(login, mentionUsers) {
  if (!mentionUsers || !login) return null;
  const lower = String(login).toLowerCase();
  return mentionUsers.find((u) => u.login && String(u.login).toLowerCase() === lower) || null;
}

function renderTextWithMentions(text, mentionUsers, onMentionClick) {
  if (text == null || text === '') return null;
  MENTION_RE.lastIndex = 0;
  const parts = [];
  let last = 0;
  let m;
  let key = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
    const prefix = m[1];
    const login = m[2];
    const user = findUserByLogin(login, mentionUsers);
    if (user && onMentionClick) {
      parts.push(
        <span key={key++} className="message-mention-wrap">
          {prefix}
          <button
            type="button"
            className="message-mention"
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick(user);
            }}
          >
            @{user.login}
          </button>
        </span>
      );
    } else {
      parts.push(
        <span key={key++} className="message-mention-wrap">
          {prefix}
          <span className="message-mention-unknown">@{login}</span>
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return [<span key={0}>{text}</span>];
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return parts;
}

function parseLine(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('||', i)) {
      const end = line.indexOf('||', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'spoiler', text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1);
      if (end !== -1) {
        tokens.push({ type: 'code', text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (line.startsWith('**', i)) {
      const end = line.indexOf('**', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'bold', text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (line.startsWith('~~', i)) {
      const end = line.indexOf('~~', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'strike', text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    let j = i + 1;
    while (j < line.length) {
      if (line.startsWith('||', j) || line[j] === '`' || line.startsWith('**', j) || line.startsWith('~~', j)) break;
      j++;
    }
    tokens.push({ type: 'text', text: line.slice(i, j) });
    i = j;
  }
  return tokens;
}

function SpoilerInline({ text, mentionUsers, onMentionClick }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`message-spoiler ${open ? 'message-spoiler-open' : ''}`}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      {open ? renderTextWithMentions(text, mentionUsers, onMentionClick) : 'Спойлер'}
    </span>
  );
}

function InlineFormatted({ line, mentionUsers, onMentionClick }) {
  const parts = parseLine(line);
  return parts.map((p, i) => {
    if (p.type === 'text') return <span key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</span>;
    if (p.type === 'bold') return <strong key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</strong>;
    if (p.type === 'strike') return <s key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</s>;
    if (p.type === 'code') return <code key={i} className="message-inline-code">{p.text}</code>;
    if (p.type === 'spoiler') return <SpoilerInline key={i} text={p.text} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />;
    return null;
  });
}

/** Telegram/Discord-подобное оформление: **жирный**, `код`, ||спойлер||; @login — клик по профилю */
export function MessageFormattedText({ text, className, mentionUsers, onMentionClick }) {
  if (text == null || text === '') return null;
  const lines = String(text).split('\n');
  return (
    <span className={className || 'message-formatted'}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <br /> : null}
          <InlineFormatted line={line} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />
        </React.Fragment>
      ))}
    </span>
  );
}
