import React, { useState } from 'react';
import { createGroup, avatarUrl } from './api';
import { requestOverlayClose } from './novaMotion';
import './GroupCreate.css';

export default function GroupCreate({ users, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const closeModal = () => requestOverlayClose(setClosing, onClose);

  const searchLower = search.trim().toLowerCase();
  const filteredUsers = searchLower
    ? users.filter(
        (u) =>
          (u.displayName || '').toLowerCase().includes(searchLower) ||
          (u.login || '').toLowerCase().includes(searchLower)
      )
    : [];

  const toggle = (id) => {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      // Удаляем из выбранных
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } else {
      // Добавляем в выбранные и очищаем поиск
      setSelectedIds((prev) => [...prev, id]);
      setSearch(''); // Очищаем поиск после добавления
    }
  };

  const submit = async () => {
    const n = name.trim();
    if (!n) { setError('Введите название группы'); return; }
    setError('');
    setLoading(true);
    try {
      await createGroup(n, selectedIds);
      onCreated();
    } catch (err) {
      setError(err.message || 'Не удалось создать группу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}`} onClick={closeModal}>
      <div className="modal group-create" onClick={(e) => e.stopPropagation()}>
        <h2>Новая группа</h2>
        <input type="text" placeholder="Название группы" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="modal-label">Добавить участников</p>
        <input
          type="text"
          className="member-search"
          placeholder="Поиск по username (например, @lololowkid) или имени"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск участников"
        />
        {search.trim() && filteredUsers.length === 0 && (
          <p className="modal-hint">Пользователи не найдены. Попробуйте искать по username (например, @lololowkid)</p>
        )}
        {selectedIds.length > 0 && (
          <div className="selected-members">
            <p className="modal-label-small">Выбрано ({selectedIds.length}):</p>
            <div className="selected-members-list">
              {users.filter(u => selectedIds.includes(u.id)).map(u => (
                <div key={u.id} className="selected-member-tag">
                  <span>@{u.login}</span>
                  <button type="button" onClick={() => toggle(u.id)} className="remove-member">×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <ul className="member-pick-list">
          {filteredUsers.map((u) => (
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
          <button type="button" className="btn-secondary" onClick={closeModal}>Отмена</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
