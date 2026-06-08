import React, { useState, useEffect } from 'react';
import { t } from './i18n';
import './ScreenPickerDialog.css';

export default function ScreenPickerDialog({ onSelect, onCancel }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(false);

  useEffect(() => {
    const loadSources = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getScreenSources) {
          const screenSources = await window.electronAPI.getScreenSources();
          setSources(screenSources || []);
        } else {
          // Fallback для браузера
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
          setSources([]);
        }
      } catch (err) {
        console.error('Failed to load screen sources:', err);
        setSources([]);
      } finally {
        setLoading(false);
      }
    };

    loadSources();
  }, []);

  const handleSelect = (sourceId) => {
    if (onSelect) {
      onSelect(sourceId, includeAudio);
    }
  };

  if (loading) {
    return (
      <div className="screen-picker-overlay" onClick={onCancel}>
        <div className="screen-picker-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="screen-picker-loading">{t('loading') || 'Загрузка...'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-picker-overlay" onClick={onCancel}>
      <div className="screen-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="screen-picker-title">{t('screenShareSelect') || 'Выберите экран или окно'}</h3>
        <div className="screen-picker-list">
          {sources.length === 0 ? (
            <div className="screen-picker-empty">{t('screenShareNoSources') || 'Нет доступных источников'}</div>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className="screen-picker-item"
                onClick={() => handleSelect(source.id)}
              >
                {source.thumbnail && (
                  <img src={source.thumbnail} alt={source.name} className="screen-picker-thumbnail" />
                )}
                <div className="screen-picker-name">{source.name}</div>
              </div>
            ))
          )}
        </div>
        <div className="screen-picker-audio">
          <label className="screen-picker-audio-label">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              className="screen-picker-audio-checkbox"
            />
            <span>{t('screenShareIncludeAudio') || 'Включить звук системы'}</span>
          </label>
        </div>
        <div className="screen-picker-actions">
          <button className="screen-picker-cancel" onClick={onCancel}>
            {t('cancel') || 'Отмена'}
          </button>
        </div>
      </div>
    </div>
  );
}
