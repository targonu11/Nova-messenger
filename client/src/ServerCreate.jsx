import React, { useState } from 'react';
import { createServer } from './api';
import './GroupCreate.css';

export default function ServerCreate({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      setError('Введите название сервера');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const s = await createServer(n);
      onCreated(s);
    } catch (e) {
      setError(e.message || 'Не удалось создать сервер');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-create" onClick={(e) => e.stopPropagation()}>
        <h2>Новый сервер</h2>
        <p className="modal-hint">Как в Discord: слева — иконка сервера, внутри — каналы для общения.</p>
        <input
          type="text"
          placeholder="Название сервера"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
