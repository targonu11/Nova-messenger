import React, { useEffect, useState } from 'react';
import { fetchLinkPreview } from './api';

const cache = new Map();

function extractFirstUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<]+[^\s<.,;:!?"')\]]/i);
  return m ? m[0] : null;
}

/** Telegram/Discord-style link preview card */
export default function LinkPreview({ text }) {
  const url = extractFirstUrl(text);
  const [data, setData] = useState(() => (url && cache.has(url) ? cache.get(url) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setData(null);
      return undefined;
    }
    if (cache.has(url)) {
      setData(cache.get(url));
      setFailed(false);
      return undefined;
    }
    let cancelled = false;
    setFailed(false);
    fetchLinkPreview(url)
      .then((preview) => {
        if (cancelled) return;
        if (!preview || (!preview.title && !preview.description && !preview.image)) {
          setFailed(true);
          return;
        }
        cache.set(url, preview);
        setData(preview);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (!url || failed || !data) return null;

  const hostname = (() => {
    try { return new URL(data.url || url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  })();

  return (
    <a
      className="link-preview"
      href={data.url || url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {data.image ? (
        <span className="link-preview-image-wrap">
          <img className="link-preview-image" src={data.image} alt="" loading="lazy" />
        </span>
      ) : null}
      <span className="link-preview-body">
        {hostname ? <span className="link-preview-host">{hostname}</span> : null}
        {data.title ? <span className="link-preview-title">{data.title}</span> : null}
        {data.description ? <span className="link-preview-desc">{data.description}</span> : null}
      </span>
    </a>
  );
}
