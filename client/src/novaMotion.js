/** Длительности анимаций закрытия (синхрон с motion.css) */
export const OVERLAY_CLOSE_MS = 220;
export const MODAL_CLOSE_MS = 280;
export const TOAST_EXIT_MS = 220;

/** Приветствие на welcome-экране по времени суток */
export function getTimeGreeting(lang = 'ru') {
  const h = new Date().getHours();
  if (lang === 'en') {
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

const WELCOME_QUOTES_RU = [
  'Общайся красиво — Nova следит за анимациями ✨',
  'Каналы, группы, звонки — всё в одном месте 🚀',
  'Дважды тапни сообщение — и ❤️ уже там',
  'Закрепи важное 📌 — не потеряется',
  'Настрой звуки и тему под себя 🎨',
  'Сигма-уровень профиля — это реально 🐺',
];

const WELCOME_QUOTES_EN = [
  'Chat beautifully — Nova keeps the animations smooth ✨',
  'Channels, groups, calls — all in one place 🚀',
  'Double-tap a message for an instant ❤️',
  'Pin what matters 📌 — never lose it',
  'Tune sounds and theme to your taste 🎨',
  'Sigma profile level is real 🐺',
];

export function getWelcomeQuote(lang = 'ru') {
  const arr = lang === 'en' ? WELCOME_QUOTES_EN : WELCOME_QUOTES_RU;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Короткая вспышка при смене темы */
export function flashThemeChange() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.getAttribute('data-reduce-motion') === 'true') return;
  let el = document.getElementById('nova-theme-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'nova-theme-flash';
    el.className = 'nova-theme-flash';
    document.body.appendChild(el);
  }
  el.classList.remove('nova-theme-flash--active');
  void el.offsetWidth;
  el.classList.add('nova-theme-flash--active');
  window.setTimeout(() => el.classList.remove('nova-theme-flash--active'), 480);
}

export function runAfterMotion(ms, fn) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Закрытие оверлея с CSS-классом --closing */
export function requestOverlayClose(setClosing, onClose, ms = OVERLAY_CLOSE_MS) {
  setClosing(true);
  return runAfterMotion(ms, () => {
    setClosing(false);
    onClose();
  });
}

/** Детектор «двойного тапа» для реакций */
export function createDoubleTapHandler(onDoubleTap, windowMs = 380) {
  let last = { id: null, t: 0 };
  return (id) => {
    const now = Date.now();
    if (last.id === id && now - last.t < windowMs) {
      last = { id: null, t: 0 };
      onDoubleTap(id);
      return true;
    }
    last = { id, t: now };
    return false;
  };
}
