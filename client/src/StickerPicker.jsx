import React, { useEffect, useMemo, useState } from 'react';
import { avatarUrl, getInstalledStickerPacks, getPackStickers } from './api';
import { useTranslation } from './i18n';
import { addRecentSticker, getRecentStickers } from './stickerRecent';
import './StickerPicker.css';

export const RECENT_PACK_ID = '__recent__';

function filterByTab(stickers, tab) {
  return (stickers || []).filter((s) => {
    if (tab === 'gif') return s.mediaType === 'animated';
    return s.mediaType !== 'animated';
  });
}

export function StickerPicker({
  open,
  tab = 'stickers',
  onTabChange,
  onSelect,
  onClose,
  onOpenStickerBot,
  focusPackId = null,
  refreshKey = 0,
}) {
  const { t } = useTranslation();
  const [packs, setPacks] = useState([]);
  const [stickersByPack, setStickersByPack] = useState({});
  const [activePackId, setActivePackId] = useState(RECENT_PACK_ID);
  const [loading, setLoading] = useState(false);
  const [recentStickers, setRecentStickers] = useState([]);

  useEffect(() => {
    if (!open) return;
    const recent = getRecentStickers();
    setRecentStickers(recent);
    let cancelled = false;
    setLoading(true);
    getInstalledStickerPacks()
      .then((data) => {
        if (cancelled) return;
        const list = data?.packs || [];
        setPacks(list);
        if (focusPackId && list.some((p) => p.id === focusPackId)) {
          setActivePackId(focusPackId);
        } else if (filterByTab(recent, tab).length > 0) {
          setActivePackId(RECENT_PACK_ID);
        } else {
          setActivePackId(list[0]?.id || RECENT_PACK_ID);
        }
      })
      .catch(() => {
        if (!cancelled) setPacks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, focusPackId, tab, refreshKey]);

  useEffect(() => {
    if (!open || packs.length === 0) return;
    let cancelled = false;
    const toLoad = packs.filter((p) => !stickersByPack[p.id]);
    if (!toLoad.length) return;
    Promise.all(
      toLoad.map((p) =>
        getPackStickers(p.id)
          .then((data) => ({ packId: p.id, stickers: data?.stickers || [] }))
          .catch(() => ({ packId: p.id, stickers: [] }))
      )
    ).then((results) => {
      if (cancelled) return;
      setStickersByPack((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.packId] = r.stickers;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [open, packs, stickersByPack]);

  const visibleRecent = useMemo(() => filterByTab(recentStickers, tab), [recentStickers, tab]);

  const visibleStickers = useMemo(() => {
    if (activePackId === RECENT_PACK_ID) return visibleRecent;
    return filterByTab(stickersByPack[activePackId] || [], tab);
  }, [activePackId, visibleRecent, stickersByPack, tab]);

  const activePack = packs.find((p) => p.id === activePackId);
  const packLoading = activePackId !== RECENT_PACK_ID && activePackId && !stickersByPack[activePackId];

  const handleSelect = (sticker) => {
    addRecentSticker(sticker);
    setRecentStickers(getRecentStickers());
    onSelect?.(sticker);
  };

  if (!open) return null;

  return (
    <div className="sticker-picker" role="dialog" aria-label={t('stickerPickerTitle')}>
      <div className="sticker-picker-header">
        <div className="sticker-picker-mode">
          <button
            type="button"
            className={`sticker-picker-mode-btn${tab === 'stickers' ? ' active' : ''}`}
            onClick={() => onTabChange?.('stickers')}
          >
            {t('stickerTabStickers')}
          </button>
          <button
            type="button"
            className={`sticker-picker-mode-btn${tab === 'gif' ? ' active' : ''}`}
            onClick={() => onTabChange?.('gif')}
          >
            GIF
          </button>
        </div>
        <button type="button" className="sticker-picker-close" onClick={onClose} aria-label={t('close')}>×</button>
      </div>

      <div className="sticker-picker-body">
        {loading && <div className="sticker-picker-empty">{t('loading')}</div>}

        {!loading && packs.length === 0 && (
          <div className="sticker-picker-empty sticker-picker-empty-main">
            <div className="sticker-picker-empty-icon" aria-hidden>🎨</div>
            <p>{t('stickerPickerEmpty')}</p>
            <button type="button" className="sticker-picker-bot-link" onClick={onOpenStickerBot}>
              {t('stickerOpenBot')}
            </button>
          </div>
        )}

        {!loading && packs.length > 0 && (
          <>
            {activePackId !== RECENT_PACK_ID && activePack && (
              <div className="sticker-picker-pack-title">{activePack.title}</div>
            )}
            {activePackId === RECENT_PACK_ID && (
              <div className="sticker-picker-pack-title">{t('stickerRecentLabel')}</div>
            )}

            {packLoading && (
              <div className="sticker-picker-empty sticker-picker-empty-inline">{t('loading')}</div>
            )}

            {!packLoading && visibleStickers.length === 0 && (
              <div className="sticker-picker-empty sticker-picker-empty-inline">
                {activePackId === RECENT_PACK_ID ? t('stickerRecentEmpty') : t('stickerPickerNoItems')}
              </div>
            )}

            <div className="sticker-picker-grid">
              {visibleStickers.map((sticker) => (
                <button
                  key={`${activePackId}-${sticker.id}`}
                  type="button"
                  className="sticker-picker-item"
                  title={sticker.emoji || ''}
                  onClick={() => handleSelect(sticker)}
                >
                  <img src={avatarUrl(sticker.filePath)} alt="" loading="lazy" draggable="false" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {packs.length > 0 && (
        <div className="sticker-picker-dock">
          <button
            type="button"
            className={`sticker-picker-dock-btn sticker-picker-dock-recent${activePackId === RECENT_PACK_ID ? ' active' : ''}`}
            title={t('stickerRecentLabel')}
            onClick={() => setActivePackId(RECENT_PACK_ID)}
          >
            <span className="sticker-picker-dock-recent-icon" aria-hidden />
          </button>
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={`sticker-picker-dock-btn${activePackId === pack.id ? ' active' : ''}`}
              title={pack.title}
              onClick={() => setActivePackId(pack.id)}
            >
              {pack.thumbPath ? (
                <img src={avatarUrl(pack.thumbPath)} alt="" draggable="false" />
              ) : (
                <span className="sticker-picker-pack-placeholder">{pack.title?.slice(0, 1) || '?'}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            className="sticker-picker-dock-btn sticker-picker-dock-add"
            title={t('stickerOpenBot')}
            onClick={onOpenStickerBot}
          >
            <span className="sticker-picker-dock-add-icon" aria-hidden>+</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function MessageSticker({
  path,
  animated = false,
  emoji = '',
  autoplayGif = true,
  onClick,
  interactive = false,
}) {
  const url = avatarUrl(path);
  if (!url) return null;
  const showAnimated = animated && autoplayGif;
  const inner = showAnimated ? (
    <img
      src={url}
      alt=""
      className="message-sticker-img message-sticker-img-animated"
      draggable="false"
      loading="lazy"
    />
  ) : animated ? (
    <div className="message-sticker-img message-sticker-img-paused" title="GIF">
      <span className="message-sticker-paused-icon" aria-hidden>GIF</span>
    </div>
  ) : (
    <img
      src={url}
      alt=""
      className="message-sticker-img"
      draggable="false"
      loading="lazy"
    />
  );

  if (interactive && onClick) {
    return (
      <button type="button" className="message-sticker message-sticker-interactive" onClick={onClick} aria-label={emoji || 'Sticker'}>
        {inner}
      </button>
    );
  }

  return (
    <div className="message-sticker" role="img" aria-label={emoji || 'Sticker'}>
      {inner}
    </div>
  );
}
