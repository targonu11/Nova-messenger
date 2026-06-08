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
  } catch {}
}
