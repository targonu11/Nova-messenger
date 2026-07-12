import React, { useMemo } from 'react';
import { t } from './i18n';

function tally(votes) {
  const map = votes && typeof votes === 'object' ? votes : {};
  const out = {};
  Object.keys(map).forEach((k) => {
    out[k] = Array.isArray(map[k]) ? map[k].map(String) : [];
  });
  return out;
}

/** Telegram/Discord-style poll card */
export default function PollMessage({ message, currentUserId, onVote, disabled }) {
  const meta = message?.messageMeta || {};
  const options = Array.isArray(meta.options) ? meta.options.map(String) : [];
  const votes = useMemo(() => tally(meta.votes), [meta.votes]);
  const multi = !!meta.multi;
  const closed = !!meta.closed;
  const uid = String(currentUserId ?? '');

  const total = useMemo(() => {
    const ids = new Set();
    Object.values(votes).forEach((arr) => arr.forEach((id) => ids.add(String(id))));
    return ids.size;
  }, [votes]);

  const myVotes = useMemo(() => {
    const set = new Set();
    Object.entries(votes).forEach(([idx, arr]) => {
      if (arr.includes(uid)) set.add(String(idx));
    });
    return set;
  }, [votes, uid]);

  if (!options.length) return null;

  return (
    <div className="poll-card">
      <div className="poll-question">{message.content || t('pollQuestion')}</div>
      <div className="poll-options">
        {options.map((label, i) => {
          const key = String(i);
          const count = (votes[key] || []).length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = myVotes.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`poll-option${active ? ' active' : ''}`}
              disabled={disabled || closed}
              onClick={() => onVote?.(message.id, i)}
            >
              <span className="poll-option-bar" style={{ width: `${pct}%` }} aria-hidden />
              <span className="poll-option-row">
                <span className="poll-option-label">
                  {active ? '✓ ' : ''}{label}
                </span>
                <span className="poll-option-meta">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="poll-footer">
        <span>{total} {t('pollVotes')}</span>
        {multi ? <span>· {t('pollMulti')}</span> : null}
        {closed ? <span>· {t('pollClosed')}</span> : null}
      </div>
    </div>
  );
}
