import React, { useState } from 'react';
import { inviteServerMembers, avatarUrl } from './api';
import './GroupCreate.css';

export default function ServerInviteModal({ serverId, users, onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.login || '').toLowerCase().includes(q)
      )
    : [];

  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!selectedIds.length) {
      setError('Выберите хотя бы одного пользователя');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await inviteServerMembers(serverId, selectedIds);
      onCreated();
    } catch (e) {
      setError(e.message || 'Не удалось пригласить');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-create" onClick={(e) => e.stopPropagation()}>
        <h2>Пригласить на сервер</h2>
        <p className="modal-label">Пользователи получат доступ ко всем каналам сервера.</p>
        <input
          type="text"
          className="member-search"
          placeholder="Поиск по имени или @логину"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="member-pick-list">
          {filtered.map((u) => (
            <li key={u.id} className={selectedIds.includes(u.id) ? 'selected' : ''} onClick={() => toggle(u.id)}>
              <img className="avatar-sm" src={avatarUrl(u.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" />
              <div className="member-info">
                <span className="member-name">{u.displayName}</span>
                <span className="member-login">@{u.login}</span>
              </div>
              {selectedIds.includes(u.id) && <span className="check">✓</span>}
            </li>
          ))}
        </ul>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? '…' : 'Пригласить'}
          </button>
        </div>
      </div>
    </div>
  );
}
