/** Совпадает с server/socialLinks.js по id. */
export const SOCIAL_PROVIDERS = [
  { id: 'reddit', labelKey: 'socialReddit' },
  { id: 'roblox', labelKey: 'socialRoblox' },
  { id: 'steam', labelKey: 'socialSteam' },
  { id: 'instagram', labelKey: 'socialInstagram' },
  { id: 'spotify', labelKey: 'socialSpotify' },
  { id: 'twitter', labelKey: 'socialTwitter' },
  { id: 'youtube', labelKey: 'socialYoutube' },
  { id: 'github', labelKey: 'socialGithub' },
  { id: 'twitch', labelKey: 'socialTwitch' },
  { id: 'discord', labelKey: 'socialDiscord' },
  { id: 'tiktok', labelKey: 'socialTiktok' },
  { id: 'telegram', labelKey: 'socialTelegram' },
];

/** Провайдеры с OAuth-привязкой (как Connections в Discord) */
export const OAUTH_CONNECTION_PROVIDERS = [
  { id: 'discord', labelKey: 'socialDiscord' },
  { id: 'steam', labelKey: 'socialSteam' },
  { id: 'spotify', labelKey: 'socialSpotify' },
];

export const MANUAL_SOCIAL_PROVIDERS = SOCIAL_PROVIDERS.filter(
  (p) => !OAUTH_CONNECTION_PROVIDERS.some((o) => o.id === p.id),
);

/**
 * Внешняя ссылка по сохранённому значению (ник или id).
 * Discord: публичной ссылки по нику нет — возвращаем пустую строку.
 */
export function buildSocialProfileUrl(providerId, handle) {
  if (!handle || typeof handle !== 'string') return '';
  const h = handle.trim();
  if (!h) return '';
  switch (providerId) {
    case 'reddit':
      return `https://www.reddit.com/user/${encodeURIComponent(h)}`;
    case 'roblox':
      if (/^\d+$/.test(h)) return `https://www.roblox.com/users/${h}/profile`;
      return `https://www.roblox.com/users/profile?username=${encodeURIComponent(h)}`;
    case 'steam':
      if (/^\d{17}$/.test(h)) return `https://steamcommunity.com/profiles/${h}`;
      return `https://steamcommunity.com/id/${encodeURIComponent(h)}`;
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(h)}/`;
    case 'spotify':
      return `https://open.spotify.com/user/${encodeURIComponent(h)}`;
    case 'twitter':
      return `https://x.com/${encodeURIComponent(h)}`;
    case 'youtube':
      if (/^UC[a-zA-Z0-9_-]{10,}$/.test(h)) {
        return `https://www.youtube.com/channel/${encodeURIComponent(h)}`;
      }
      return `https://www.youtube.com/@${encodeURIComponent(h.replace(/^@/, ''))}`;
    case 'github':
      return `https://github.com/${encodeURIComponent(h)}`;
    case 'twitch':
      return `https://www.twitch.tv/${encodeURIComponent(h)}`;
    case 'discord':
      if (/^\d{17,20}$/.test(h)) return `https://discord.com/users/${h}`;
      return '';
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(h.replace(/^@/, ''))}`;
    case 'telegram':
      return `https://t.me/${encodeURIComponent(h.replace(/^@/, ''))}`;
    default:
      return '';
  }
}
