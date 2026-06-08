import { t } from './i18n';

function isVoiceMsg(msg) {
  if (!msg) return false;
  if (msg.voiceMeta) return true;
  const p = msg.attachmentPath || msg.voicePath || '';
  return /\.(webm|ogg|mp3|wav|m4a|opus)/i.test(String(p));
}

function isImageMsg(msg) {
  const p = msg?.attachmentPath || '';
  return /\.(jpe?g|png|gif|webp|bmp|svg)/i.test(String(p));
}

/** Короткий текст последнего сообщения для списка чатов (как в Telegram) */
export function formatMessagePreview(msg, { isGroup = false, senderName = '' } = {}) {
  if (!msg) return '';
  if (msg.isDeleted) return t('previewDeleted');

  let body = '';
  if (msg.messageType === 'sticker') body = msg.messageMeta?.mediaType === 'animated' ? 'GIF' : t('previewSticker');
  else if (isVoiceMsg(msg)) body = t('previewVoice');
  else if (isImageMsg(msg)) body = t('previewPhoto');
  else if (msg.attachmentPath) body = t('previewFile');
  else if (msg.forwardFromName) body = msg.content?.trim() || t('previewForward');
  else if (msg.content?.startsWith?.('e2e:')) body = t('previewEncrypted');
  else body = (msg.content || '').trim();

  if (!body) body = t('previewEmpty');

  if (isGroup && senderName && msg.senderId) {
    const short = senderName.split(' ')[0];
    return `${short}: ${body}`;
  }
  return body;
}

/** Время в списке чатов: 14:32, вчера, пн */
export function formatChatListTime(unixSec) {
  if (!unixSec) return '';
  const d = new Date(unixSec * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - msgDay) / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return t('timeYesterday');
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
