export function draftStorageKey(recipientType, recipientId) {
  return `nova_draft_${recipientType}_${recipientId || 'none'}`;
}

export function loadDraft(recipientType, recipientId) {
  if (!recipientId) return '';
  try {
    return localStorage.getItem(draftStorageKey(recipientType, recipientId)) || '';
  } catch {
    return '';
  }
}

export function saveDraft(recipientType, recipientId, text) {
  if (!recipientId) return;
  try {
    const k = draftStorageKey(recipientType, recipientId);
    if (text && String(text).trim()) localStorage.setItem(k, text);
    else localStorage.removeItem(k);
    window.dispatchEvent(new CustomEvent('nova-drafts'));
  } catch {}
}

/** Map of `type:id` → draft preview text */
export function getDraftMap() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('nova_draft_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw || !String(raw).trim()) continue;
      const rest = key.slice('nova_draft_'.length);
      const idx = rest.indexOf('_');
      if (idx < 0) continue;
      const type = rest.slice(0, idx);
      const id = rest.slice(idx + 1);
      if (!id || id === 'none') continue;
      out[`${type}:${id}`] = String(raw).trim();
    }
  } catch {}
  return out;
}
