import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { getAgeFromBirthday, formatAgeLabel } from './profileAge';
import './BirthdayWheelPicker.css';

const CONFETTI_COLORS = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245'];

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_FULL_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(month, year) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

export function parseBirthdayIso(iso) {
  if (!iso || typeof iso !== 'string') return { day: null, month: null, year: null };
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { day: null, month: null, year: null };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function toIso(day, month, year) {
  if (!day || !month || !year) return '';
  const maxD = daysInMonth(month, year);
  const d = Math.min(day, maxD);
  return `${year}-${pad2(month)}-${pad2(d)}`;
}

export function isBirthdayComplete(iso) {
  const p = parseBirthdayIso(iso);
  return Boolean(p.day && p.month && p.year);
}

export function formatBirthdayDots(iso, placeholder = 'дд.мм.гггг') {
  if (!iso) return placeholder;
  const p = parseBirthdayIso(iso);
  if (!p.day || !p.month || !p.year) return placeholder;
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

function formatPreviewLong(iso, lang) {
  const p = parseBirthdayIso(iso);
  if (!p.day || !p.month || !p.year) return null;
  const months = lang === 'en' ? MONTHS_FULL_EN : MONTHS_FULL_RU;
  const monthName = months[p.month - 1] || pad2(p.month);
  if (lang === 'en') return `${monthName} ${p.day}, ${p.year}`;
  return `${p.day} ${monthName} ${p.year}`;
}

function emptyParts() {
  return { day: null, month: null, year: null };
}

function fillDefaults(parts) {
  const y = new Date().getFullYear() - 20;
  return {
    day: parts.day ?? 15,
    month: parts.month ?? 6,
    year: parts.year ?? y,
  };
}

function normalizeParts(parts) {
  let { day, month, year } = parts;
  if (!day || !month || !year) return parts;
  const maxD = daysInMonth(month, year);
  if (day > maxD) day = maxD;
  return { day, month, year };
}

function findCenterValue(listEl) {
  if (!listEl) return null;
  const mid = listEl.scrollTop + listEl.clientHeight / 2;
  let best = null;
  let bestDist = Infinity;
  listEl.querySelectorAll('.birthday-wheel-item[data-value]').forEach((node) => {
    const center = node.offsetTop + node.offsetHeight / 2;
    const dist = Math.abs(center - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  });
  if (!best) return null;
  const v = best.getAttribute('data-value');
  return v === '' ? null : Number(v);
}

function WheelColumn({ items, value, onChange, ariaLabel, label, stepDownLabel, stepUpLabel }) {
  const listRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const slotLabel = value != null ? items.find((i) => i.value === value)?.label ?? '' : '';

  const scrollToValue = useCallback((v, smooth = true) => {
    const el = listRef.current;
    if (!el || v == null) return;
    const row = el.querySelector(`[data-value="${v}"]`);
    if (row) row.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToValue(value, false);
  }, [value, items.length, scrollToValue]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const onScrollEnd = () => {
      const num = findCenterValue(el);
      if (num != null && num !== value) onChange(num);
      if (num != null) scrollToValue(num, true);
    };
    const onScroll = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(onScrollEnd, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [value, onChange, scrollToValue]);

  const step = (delta) => {
    if (!items.length) return;
    const idx = value == null
      ? (delta > 0 ? 0 : items.length - 1)
      : items.findIndex((i) => i.value === value);
    const base = idx === -1 ? 0 : idx;
    const next = items[Math.max(0, Math.min(items.length - 1, base + delta))];
    if (next) {
      onChange(next.value);
      scrollToValue(next.value, true);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  };

  return (
    <div className="birthday-wheel-field">
      <span className="birthday-wheel-field-label">{label}</span>
      <div className="birthday-wheel-field-row">
        <button type="button" className="birthday-wheel-step" onClick={() => step(-1)} aria-label={stepDownLabel} tabIndex={-1}>−</button>
        <div className="birthday-wheel-col" role="group" aria-label={ariaLabel}>
          <div className="birthday-wheel-col-fade birthday-wheel-col-fade--top" aria-hidden />
          <div className="birthday-wheel-col-highlight" aria-hidden />
          <div className="birthday-wheel-col-fade birthday-wheel-col-fade--bottom" aria-hidden />
          <div className="birthday-wheel-col-slot" aria-hidden>{slotLabel}</div>
          <ul ref={listRef} className="birthday-wheel-col-list" tabIndex={0} onKeyDown={onKeyDown}>
            <li className="birthday-wheel-item birthday-wheel-item--spacer" aria-hidden />
            {items.map((item) => (
              <li key={String(item.value)} className="birthday-wheel-item" data-value={item.value}>
                <button
                  type="button"
                  data-value={item.value}
                  className={`birthday-wheel-item-btn${value === item.value ? ' birthday-wheel-item-btn--active' : ''}`}
                  onClick={() => {
                    onChange(item.value);
                    scrollToValue(item.value, true);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
            <li className="birthday-wheel-item birthday-wheel-item--spacer" aria-hidden />
          </ul>
        </div>
        <button type="button" className="birthday-wheel-step" onClick={() => step(1)} aria-label={stepUpLabel} tabIndex={-1}>+</button>
      </div>
    </div>
  );
}

export default forwardRef(function BirthdayWheelPicker({ value, onChange, lang = 'ru', clearLabel }, ref) {
  const nowYear = new Date().getFullYear();
  const monthLabels = lang === 'en' ? MONTHS_EN : MONTHS_RU;
  const wasCompleteRef = useRef(isBirthdayComplete(value));
  const [celebrate, setCelebrate] = useState(false);
  const [parts, setParts] = useState(() => {
    const saved = parseBirthdayIso(value);
    if (saved.day && saved.month && saved.year) return saved;
    return emptyParts();
  });

  useEffect(() => {
    const saved = parseBirthdayIso(value);
    if (saved.day && saved.month && saved.year) {
      setParts(saved);
    } else if (!value) {
      setParts(emptyParts());
    }
  }, [value]);

  const partsComplete = Boolean(parts.day && parts.month && parts.year);
  const previewIso = partsComplete ? toIso(parts.day, parts.month, parts.year) : '';
  const isComplete = isBirthdayComplete(value);
  const previewLong = formatPreviewLong(previewIso || value, lang);
  const ageLabel = isComplete ? formatAgeLabel(getAgeFromBirthday(value), lang) : '';

  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      setCelebrate(true);
      wasCompleteRef.current = true;
      const timer = window.setTimeout(() => setCelebrate(false), 1000);
      return () => window.clearTimeout(timer);
    }
    if (!isComplete) wasCompleteRef.current = false;
  }, [isComplete]);

  const years = useMemo(() => {
    const list = [];
    for (let y = nowYear; y >= 1900; y -= 1) list.push(y);
    return list;
  }, [nowYear]);

  const months = useMemo(
    () => monthLabels.map((label, i) => ({ value: i + 1, label })),
    [monthLabels]
  );

  const days = useMemo(() => {
    const max = daysInMonth(parts.month || 1, parts.year || nowYear);
    return Array.from({ length: max }, (_, i) => ({
      value: i + 1,
      label: pad2(i + 1),
    }));
  }, [parts.month, parts.year, nowYear]);

  const commitParts = useCallback((nextRaw) => {
    const next = normalizeParts(fillDefaults(nextRaw));
    setParts(next);
    onChange(toIso(next.day, next.month, next.year));
  }, [onChange]);

  const setPart = useCallback((part, num) => {
    commitParts({ ...parts, [part]: num });
  }, [parts, commitParts]);

  useImperativeHandle(ref, () => ({
    getIso: () => {
      if (isBirthdayComplete(value)) return value.trim();
      if (partsComplete) return previewIso;
      return '';
    },
  }), [value, partsComplete, previewIso]);

  const labels = lang === 'en'
    ? { day: 'Day', month: 'Month', year: 'Year', hint: 'Scroll, use ± or arrow keys', pickAll: 'Select day, month and year' }
    : { day: 'День', month: 'Месяц', year: 'Год', hint: 'Крути, жми ± или стрелки ↑↓', pickAll: 'Выберите день, месяц и год' };

  return (
    <div className={`birthday-wheel${celebrate ? ' birthday-wheel--celebrate' : ''}`}>
      <div className="birthday-picker-card">
        <div className={`birthday-picker-preview${celebrate ? ' birthday-picker-preview--celebrate' : ''}`}>
          <span className="birthday-picker-preview-icon" aria-hidden>🎂</span>
          <div className="birthday-picker-preview-main">
            <span className={`birthday-picker-preview-digits${!isComplete ? ' birthday-picker-preview-digits--pending' : ''}`}>
              {isComplete
                ? formatBirthdayDots(value, lang === 'en' ? 'dd.mm.yyyy' : 'дд.мм.гггг')
                : (partsComplete
                  ? formatBirthdayDots(previewIso, lang === 'en' ? 'dd.mm.yyyy' : 'дд.мм.гггг')
                  : (lang === 'en' ? 'Pick a date' : 'Выберите дату'))}
            </span>
            {previewLong && <span className="birthday-picker-preview-long">{previewLong}</span>}
            {ageLabel && <span className="birthday-picker-preview-age">{ageLabel}</span>}
            {!isComplete && !partsComplete && <span className="birthday-picker-preview-warn">{labels.pickAll}</span>}
          </div>
          <div className="birthday-picker-steps" aria-hidden>
            <span className={`birthday-picker-step${parts.day ? ' birthday-picker-step--done' : ''}`}>D</span>
            <span className={`birthday-picker-step${parts.month ? ' birthday-picker-step--done' : ''}`}>M</span>
            <span className={`birthday-picker-step${parts.year ? ' birthday-picker-step--done' : ''}`}>Y</span>
          </div>
        </div>

        {celebrate && (
          <div className="birthday-wheel-confetti" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                style={{
                  '--dx': `${(Math.random() - 0.5) * 100}px`,
                  '--dy': `${-30 - Math.random() * 70}px`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${i * 0.03}s`,
                }}
              />
            ))}
          </div>
        )}

        <div className="birthday-wheel-columns">
          <WheelColumn label={labels.day} ariaLabel={labels.day} stepDownLabel={lang === 'en' ? 'Previous day' : 'Предыдущий день'} stepUpLabel={lang === 'en' ? 'Next day' : 'Следующий день'} items={days} value={parts.day} onChange={(v) => setPart('day', v)} />
          <WheelColumn label={labels.month} ariaLabel={labels.month} stepDownLabel={lang === 'en' ? 'Previous month' : 'Предыдущий месяц'} stepUpLabel={lang === 'en' ? 'Next month' : 'Следующий месяц'} items={months} value={parts.month} onChange={(v) => setPart('month', v)} />
          <WheelColumn label={labels.year} ariaLabel={labels.year} stepDownLabel={lang === 'en' ? 'Previous year' : 'Предыдущий год'} stepUpLabel={lang === 'en' ? 'Next year' : 'Следующий год'} items={years.map((y) => ({ value: y, label: String(y) }))} value={parts.year} onChange={(v) => setPart('year', v)} />
        </div>

        <p className="birthday-picker-hint">{labels.hint}</p>

        {clearLabel && value && (
          <button type="button" className="birthday-wheel-clear" onClick={() => { onChange(''); setParts(emptyParts()); }}>
            {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
});
