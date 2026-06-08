import { getProfileCompleteness } from './profileAge';

const TITLES_RU = ['Новичок', 'Общительный', 'Активный', 'Профи', 'Мастер', 'Легенда', 'Сигма'];
const TITLES_EN = ['Rookie', 'Social', 'Active', 'Pro', 'Master', 'Legend', 'Sigma'];

const THRESHOLDS = [0, 12, 28, 44, 60, 76, 92, 100];

export function computeProfileXp(user) {
  if (!user) return 0;
  let xp = getProfileCompleteness(user);
  if (user.badgeId) xp += 8;
  if (user.isVerified) xp += 5;
  return Math.min(100, xp);
}

export function levelFromXp(xp) {
  for (let i = THRESHOLDS.length - 2; i >= 0; i -= 1) {
    if (xp >= THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function xpProgressInLevel(xp, level) {
  const start = THRESHOLDS[level - 1] ?? 0;
  const end = THRESHOLDS[level] ?? 100;
  if (end <= start) return 100;
  return Math.round(((xp - start) / (end - start)) * 100);
}

export function getLevelTitle(level, lang = 'ru') {
  const titles = lang === 'en' ? TITLES_EN : TITLES_RU;
  return titles[Math.min(Math.max(level, 1), titles.length) - 1] || titles[0];
}

export function getProfileLevelInfo(user, lang = 'ru') {
  const xp = computeProfileXp(user);
  const level = levelFromXp(xp);
  return {
    xp,
    level,
    title: getLevelTitle(level, lang),
    progress: xpProgressInLevel(xp, level),
    maxLevel: TITLES_RU.length,
  };
}
