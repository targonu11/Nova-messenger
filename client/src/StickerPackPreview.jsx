import React, { useEffect, useState } from 'react';
import { avatarUrl, getStickerPackInfo, getPackStickers, installStickerPack } from './api';
import { MessageSticker } from './StickerPicker';
import { useTranslation } from './i18n';
import { getBatteryGifAutoplay } from './appSettings';
import './StickerPackPreview.css';

export default function StickerPackPreview({ packId, stickerId, previewPath, previewEmoji, previewMediaType, onClose, onInstalled }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [packInfo, setPackInfo] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [featuredId, setFeaturedId] = useState(stickerId);
  const [featuredPath, setFeaturedPath] = useState(previewPath);
  const [featuredEmoji, setFeaturedEmoji] = useState(previewEmoji);
  const [featuredAnimated, setFeaturedAnimated] = useState(previewMediaType === 'animated');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        let info = null;
        try {
          info = await getStickerPackInfo(packId, stickerId);
        } catch (infoErr) {
          // Fallback: старый сервер или сбой info — пробуем загрузить стикеры напрямую
          try {
            const { stickers: list } = await getPackStickers(packId, null, stickerId);
            if (cancelled) return;
            if (list?.length) {
              info = {
                pack: { id: packId, title: t('stickerPackPreviewTitle'), stickerCount: list.length },
                installed: false,
                canViewStickers: true,
                canInstall: false,
                isPublic: false,
                isOwner: false,
              };
              setPackInfo(info);
              setStickers(list);
              const featured = list.find((s) => s.id === stickerId);
              if (featured) {
                setFeaturedId(featured.id);
                setFeaturedPath(featured.filePath);
                setFeaturedEmoji(featured.emoji);
                setFeaturedAnimated(featured.mediaType === 'animated');
              }
              return;
            }
          } catch {}
          throw infoErr;
        }
        if (cancelled) return;
        setPackInfo(info);
        setInstalled(!!info.installed);

        if (info.canViewStickers) {
          const { stickers: list } = await getPackStickers(packId, null, stickerId);
          if (cancelled) return;
          setStickers(list || []);
          const featured = (list || []).find((s) => s.id === stickerId);
          if (featured) {
            setFeaturedId(featured.id);
            setFeaturedPath(featured.filePath);
            setFeaturedEmoji(featured.emoji);
            setFeaturedAnimated(featured.mediaType === 'animated');
          }
        } else {
          setStickers([]);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [packId, stickerId, previewPath, previewEmoji, previewMediaType]);

  const handleInstall = async () => {
    if (!packInfo?.canInstall || installing || installed) return;
    setInstalling(true);
    setError('');
    try {
      await installStickerPack(packId);
      setInstalled(true);
      onInstalled?.();
    } catch (e) {
      setError(e.message || 'Error');
    } finally {
      setInstalling(false);
    }
  };

  const selectSticker = (s) => {
    setFeaturedId(s.id);
    setFeaturedPath(s.filePath);
    setFeaturedEmoji(s.emoji);
    setFeaturedAnimated(s.mediaType === 'animated');
  };

  const title = packInfo?.pack?.title || t('stickerPackPreviewTitle');
  const count = packInfo?.pack?.stickerCount ?? stickers.length;
  const canInstall = packInfo?.canInstall && !installed;
  const showPrivateHint = packInfo && !packInfo.canInstall && !installed && !packInfo.isOwner;

  return (
    <div className="modal-overlay sticker-pack-preview-overlay" onClick={onClose}>
      <div
        className="sticker-pack-preview"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-pack-preview-title"
      >
        <div className="sticker-pack-preview-head">
          <button type="button" className="sticker-pack-preview-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
          <h2 id="sticker-pack-preview-title" className="sticker-pack-preview-title">
            {title}
          </h2>
          {count > 0 && (
            <p className="sticker-pack-preview-count">
              {count} {t('stickerPackStickersCount')}
            </p>
          )}
        </div>

        <div className="sticker-pack-preview-featured">
          <MessageSticker
            path={featuredPath}
            animated={featuredAnimated}
            emoji={featuredEmoji}
            autoplayGif={getBatteryGifAutoplay()}
          />
        </div>

        {loading ? (
          <p className="sticker-pack-preview-status">{t('loading')}</p>
        ) : (
          <>
            {stickers.length > 0 ? (
              <div className="sticker-pack-preview-grid">
                {stickers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`sticker-pack-preview-item${s.id === featuredId ? ' active' : ''}`}
                    onClick={() => selectSticker(s)}
                    aria-label={s.emoji || 'Sticker'}
                  >
                    <img src={avatarUrl(s.filePath)} alt="" draggable="false" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="sticker-pack-preview-status">{t('stickerPickerNoItems')}</p>
            )}

            {error && <p className="sticker-pack-preview-error">{error}</p>}

            <div className="sticker-pack-preview-actions">
              {installed ? (
                <button type="button" className="sticker-pack-preview-btn sticker-pack-preview-btn-done" disabled>
                  {t('stickerPackAlreadyAdded')}
                </button>
              ) : canInstall ? (
                <button
                  type="button"
                  className="sticker-pack-preview-btn sticker-pack-preview-btn-add"
                  onClick={handleInstall}
                  disabled={installing}
                >
                  {installing ? t('loading') : t('stickerPackAdd')}
                </button>
              ) : showPrivateHint ? (
                <p className="sticker-pack-preview-private">{t('stickerPackPrivate')}</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
