import React from 'react';
import { wrapInputSelection } from './messageFormat';
import { t } from './i18n';

const TOOLS = [
  { id: 'bold', label: 'B', titleKey: 'fmtBold', before: '**', after: '**', className: 'fmt-bold' },
  { id: 'italic', label: 'I', titleKey: 'fmtItalic', before: '*', after: '*', className: 'fmt-italic' },
  { id: 'underline', label: 'U', titleKey: 'fmtUnderline', before: '__', after: '__', className: 'fmt-underline' },
  { id: 'strike', label: 'S', titleKey: 'fmtStrike', before: '~~', after: '~~', className: 'fmt-strike' },
  { id: 'code', label: '</>', titleKey: 'fmtCode', before: '`', after: '`' },
  { id: 'spoiler', label: '||', titleKey: 'fmtSpoiler', before: '||', after: '||' },
  { id: 'quote', label: '❝', titleKey: 'fmtQuote', before: '> ', after: '' },
];

export default function FormatToolbar({ inputRef, value, setValue }) {
  const apply = (before, after) => {
    const el = inputRef?.current;
    if (!el) return;
    const result = wrapInputSelection(el, before, after);
    if (!result) return;
    setValue(result.next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursorStart, result.cursorEnd);
    });
  };

  return (
    <div className="format-toolbar" role="toolbar" aria-label={t('fmtToolbar')}>
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`format-toolbar-btn ${tool.className || ''}`}
          title={t(tool.titleKey)}
          onMouseDown={(e) => {
            e.preventDefault();
            apply(tool.before, tool.after);
          }}
        >
          {tool.label}
        </button>
      ))}
      <span className="format-toolbar-hint" title={t('fmtHint')}>
        TG/DS
      </span>
    </div>
  );
}
