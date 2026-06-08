import React, { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PhotoViewer.css';

export function PhotoViewer({ open, urls, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex ?? 0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const wrapRef = useRef(null);
  const touchStartX = useRef(null);

  const list = Array.isArray(urls) && urls.length ? urls : [];
  const safeIndex = list.length ? Math.min(Math.max(0, index), list.length - 1) : 0;
  const src = list[safeIndex] || '';

  useEffect(() => {
    if (open) setIndex(initialIndex ?? 0);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goPrev = useCallback(() => {
    if (list.length < 2) return;
    setIndex((i) => (i <= 0 ? list.length - 1 : i - 1));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [list.length]);

  const goNext = useCallback(() => {
    if (list.length < 2) return;
    setIndex((i) => (i >= list.length - 1 ? 0 : i + 1));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [list.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext]);

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => Math.min(4, Math.max(1, Math.round((z + delta) * 100) / 100)));
    if (zoom + delta <= 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current || zoom <= 1) return;
    setPan({
      x: e.clientX - dragRef.current.x,
      y: e.clientY - dragRef.current.y,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const toggleZoom = () => {
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else setZoom(2);
  };

  if (!open || !src) return null;

  return createPortal(
    <div
      className="photo-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="photo-viewer-toolbar">
        <button type="button" className="photo-viewer-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {list.length > 1 && (
          <span className="photo-viewer-counter">
            {safeIndex + 1} / {list.length}
          </span>
        )}
        <button type="button" className="photo-viewer-btn" onClick={toggleZoom} aria-label="Zoom">
          {zoom > 1 ? '1:1' : '🔍'}
        </button>
      </div>

      {list.length > 1 && (
        <>
          <button type="button" className="photo-viewer-nav photo-viewer-nav-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Previous">
            ‹
          </button>
          <button type="button" className="photo-viewer-nav photo-viewer-nav-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Next">
            ›
          </button>
        </>
      )}

      <div
        ref={wrapRef}
        className="photo-viewer-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={toggleZoom}
        onTouchStart={(e) => {
          if (e.touches.length === 1) touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (zoom > 1) {
            touchStartX.current = null;
            return;
          }
          if (touchStartX.current == null || list.length < 2) return;
          const x = e.changedTouches[0].clientX;
          const dx = x - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) < 48) return;
          if (dx < 0) goNext();
          else goPrev();
        }}
      >
        <img
          key={src}
          src={src}
          alt=""
          className="photo-viewer-img"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
          draggable={false}
        />
      </div>
      <p className="photo-viewer-hint">Esc — закрыть · ← → — фото · Ctrl+колёсико — масштаб</p>
    </div>,
    document.body
  );
}
