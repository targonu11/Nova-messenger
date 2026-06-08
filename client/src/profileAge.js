/** Возраст и форматирование даты рождения */

export function getAgeFromBirthday(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const birth = new Date(y, mo, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo || birth.getDate() !== d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthday =
    now.getMonth() > mo || (now.getMonth() === mo && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

export function formatAgeLabel(age, lang = 'ru') {
  if (age == null || !Number.isFinite(age)) return '';
  if (lang === 'en') return `${age} years old`;
  const n = Math.abs(age) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `${age} лет`;
  if (n1 === 1) return `${age} год`;
  if (n1 >= 2 && n1 <= 4) return `${age} года`;
  return `${age} лет`;
}

export function getProfileCompleteness(user) {
  if (!user) return 0;
  let score = 0;
  const checks = [
    Boolean(user.displayName?.trim()),
    Boolean(user.bio?.trim()),
    Boolean(user.avatarPath),
    Boolean(user.coverPath),
    Boolean(user.birthday),
    Boolean(user.customStatusText || user.customStatusEmoji),
  ];
  checks.forEach((ok) => { if (ok) score += 1; });
  return Math.round((score / checks.length) * 100);
}

const ZODIAC = [
  { id: 'capricorn', ru: 'Козерог', en: 'Capricorn', start: [12, 22], end: [1, 19] },
  { id: 'aquarius', ru: 'Водолей', en: 'Aquarius', start: [1, 20], end: [2, 18] },
  { id: 'pisces', ru: 'Рыбы', en: 'Pisces', start: [2, 19], end: [3, 20] },
  { id: 'aries', ru: 'Овен', en: 'Aries', start: [3, 21], end: [4, 19] },
  { id: 'taurus', ru: 'Телец', en: 'Taurus', start: [4, 20], end: [5, 20] },
  { id: 'gemini', ru: 'Близнецы', en: 'Gemini', start: [5, 21], end: [6, 20] },
  { id: 'cancer', ru: 'Рак', en: 'Cancer', start: [6, 21], end: [7, 22] },
  { id: 'leo', ru: 'Лев', en: 'Leo', start: [7, 23], end: [8, 22] },
  { id: 'virgo', ru: 'Дева', en: 'Virgo', start: [8, 23], end: [9, 22] },
  { id: 'libra', ru: 'Весы', en: 'Libra', start: [9, 23], end: [10, 22] },
  { id: 'scorpio', ru: 'Скорпион', en: 'Scorpio', start: [10, 23], end: [11, 21] },
  { id: 'sagittarius', ru: 'Стрелец', en: 'Sagittarius', start: [11, 22], end: [12, 21] },
];

function dayOfYear(month, day) {
  return month * 100 + day;
}

export function getZodiacSign(iso, lang = 'ru') {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = dayOfYear(month, day);
  for (const z of ZODIAC) {
    const [sm, sd] = z.start;
    const [em, ed] = z.end;
    const start = dayOfYear(sm, sd);
    const end = dayOfYear(em, ed);
    if (start > end) {
      if (d >= start || d <= end) return lang === 'en' ? z.en : z.ru;
    } else if (d >= start && d <= end) {
      return lang === 'en' ? z.en : z.ru;
    }
  }
  return null;
}

export function getDaysUntilBirthday(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), month, day);
  if (next.getTime() === now.getTime()) return 0;
  if (next < now) next = new Date(now.getFullYear() + 1, month, day);
  return Math.round((next - now) / 86400000);
}

export function formatBirthdayCountdown(days, lang = 'ru') {
  if (days == null || !Number.isFinite(days)) return '';
  if (days === 0) return lang === 'en' ? 'Birthday today! 🎂' : 'Сегодня день рождения! 🎂';
  if (days === 1) return lang === 'en' ? 'Birthday tomorrow 🎁' : 'Завтра день рождения 🎁';
  if (lang === 'en') return `${days} days until birthday`;
  const n = Math.abs(days) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `До дня рождения ${days} дней`;
  if (n1 === 1) return `До дня рождения ${days} день`;
  if (n1 >= 2 && n1 <= 4) return `До дня рождения ${days} дня`;
  return `До дня рождения ${days} дней`;
}
