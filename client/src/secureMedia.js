/**
 * getUserMedia и полноценный WebRTC в браузерах разрешены только в «безопасном контексте»:
 * HTTPS или localhost/127.0.0.1. Сайт по http://ПУБЛИЧНЫЙ_IP — небезопасный контекст →
 * на VPS звонки «не работают», на localhost — работают (это не баг сервера Node).
 */
export function isMediaCallSupportedInThisPage() {
  if (typeof window === 'undefined') return true;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}
