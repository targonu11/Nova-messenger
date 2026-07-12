import React, { useState } from 'react';

/** @mention / @everyone after start, space or "(" */
const MENTION_RE = /(^|[\s(])@([a-zA-Z0-9_]+|everyone|here|channel)/gi;
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/g;

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ lang, text }) {
  const [copied, setCopied] = useState(false);
  return (
    <pre className="message-code-block">
      <span className="message-code-toolbar">
        {lang ? <span className="message-code-lang">{lang}</span> : <span className="message-code-lang">code</span>}
        <button
          type="button"
          className="message-code-copy"
          onClick={async (e) => {
            e.stopPropagation();
            const ok = await copyText(text);
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }
          }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </span>
      <code>{text}</code>
    </pre>
  );
}

function findUserByLogin(login, mentionUsers) {
  if (!mentionUsers || !login) return null;
  const lower = String(login).toLowerCase();
  if (lower === 'everyone' || lower === 'here' || lower === 'channel') return null;
  return mentionUsers.find((u) => u.login && String(u.login).toLowerCase() === lower) || null;
}

function isSpecialMention(login) {
  const lower = String(login || '').toLowerCase();
  return lower === 'everyone' || lower === 'here' || lower === 'channel';
}

function renderUrlsAndText(text) {
  if (text == null || text === '') return null;
  const parts = [];
  let last = 0;
  let m;
  let key = 0;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const href = m[1];
    parts.push(
      <a
        key={key++}
        className="message-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return [<span key={0}>{text}</span>];
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return parts;
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
      parts.push(<span key={key++}>{renderUrlsAndText(text.slice(last, m.index))}</span>);
    }
    const prefix = m[1];
    const login = m[2];
    if (isSpecialMention(login)) {
      parts.push(
        <span key={key++} className="message-mention-wrap">
          {prefix}
          <span className="message-mention message-mention--everyone">@{login.toLowerCase()}</span>
        </span>
      );
    } else {
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
    }
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return renderUrlsAndText(text);
  if (last < text.length) parts.push(<span key={key++}>{renderUrlsAndText(text.slice(last))}</span>);
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
    if (line.startsWith('__', i)) {
      const end = line.indexOf('__', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'underline', text: line.slice(i + 2, end) });
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
    if (line[i] === '*' && line[i + 1] !== '*') {
      const end = line.indexOf('*', i + 1);
      if (end !== -1 && line[end + 1] !== '*') {
        tokens.push({ type: 'italic', text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (line[i] === '_' && line[i + 1] !== '_') {
      const end = line.indexOf('_', i + 1);
      if (end !== -1 && line[end + 1] !== '_') {
        tokens.push({ type: 'italic', text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    let j = i + 1;
    while (j < line.length) {
      if (
        line.startsWith('||', j) ||
        line[j] === '`' ||
        line.startsWith('**', j) ||
        line.startsWith('__', j) ||
        line.startsWith('~~', j) ||
        (line[j] === '*' && line[j + 1] !== '*') ||
        (line[j] === '_' && line[j + 1] !== '_')
      ) break;
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
    if (p.type === 'italic') return <em key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</em>;
    if (p.type === 'underline') return <u key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</u>;
    if (p.type === 'strike') return <s key={i}>{renderTextWithMentions(p.text, mentionUsers, onMentionClick)}</s>;
    if (p.type === 'code') return <code key={i} className="message-inline-code">{p.text}</code>;
    if (p.type === 'spoiler') return <SpoilerInline key={i} text={p.text} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />;
    return null;
  });
}

/** Split fenced code blocks */
function splitBlocks(text) {
  const raw = String(text);
  const blocks = [];
  const fence = new RegExp('```([a-zA-Z0-9_+-]*)?\\n?([\\s\\S]*?)```', 'g');
  let last = 0;
  let m;
  while ((m = fence.exec(raw)) !== null) {
    if (m.index > last) blocks.push({ type: 'text', text: raw.slice(last, m.index) });
    blocks.push({ type: 'codeblock', lang: m[1] || '', text: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < raw.length) blocks.push({ type: 'text', text: raw.slice(last) });
  if (blocks.length === 0) blocks.push({ type: 'text', text: raw });
  return blocks;
}

/** TG/DS markdown: bold, italic, underline, strike, code, spoiler, quote, mentions */
export function MessageFormattedText({ text, className, mentionUsers, onMentionClick }) {
  if (text == null || text === '') return null;
  const blocks = splitBlocks(text);

  return (
    <span className={className || 'message-formatted'}>
      {blocks.map((block, bi) => {
        if (block.type === 'codeblock') {
          return <CodeBlock key={bi} lang={block.lang} text={block.text} />;
        }
        const lines = block.text.split('\n');
        return lines.map((line, li) => {
          const isQuote = /^>\s?/.test(line);
          const content = isQuote ? line.replace(/^>\s?/, '') : line;
          return (
            <React.Fragment key={`${bi}-${li}`}>
              {li > 0 ? <br /> : null}
              {isQuote ? (
                <span className="message-blockquote">
                  <InlineFormatted line={content} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />
                </span>
              ) : (
                <InlineFormatted line={content} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />
              )}
            </React.Fragment>
          );
        });
      })}
    </span>
  );
}

/** Wrap selection in input (format toolbar) */
export function wrapInputSelection(inputEl, before, after, placeholder = 'text') {
  if (!inputEl) return null;
  const s = inputEl.selectionStart ?? 0;
  const e = inputEl.selectionEnd ?? 0;
  const value = inputEl.value || '';
  const selected = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + selected + after + value.slice(e);
  const cursor = s + before.length + selected.length;
  return { next, cursorStart: s + before.length, cursorEnd: cursor };
}
