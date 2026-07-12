/** Nova Imba FX — каталог, рулетка, авто-слова, mood */

export const MESSAGE_FX = [
  { id: 'fire', emoji: '🔥', label: 'Fire', slash: '/fire' },
  { id: 'ice', emoji: '❄️', label: 'Ice', slash: '/ice' },
  { id: 'party', emoji: '🎉', label: 'Party', slash: '/party' },
  { id: 'shock', emoji: '⚡', label: 'Shock', slash: '/shock' },
  { id: 'void', emoji: '🌑', label: 'Void', slash: '/void' },
  { id: 'neon', emoji: '💜', label: 'Neon', slash: '/neon' },
  { id: 'glitch', emoji: '👾', label: 'Glitch', slash: '/glitch' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow', slash: '/rainbow' },
  { id: 'boom', emoji: '💥', label: 'Boom', slash: '/boom' },
  { id: 'love', emoji: '💘', label: 'Love', slash: '/love' },
  { id: 'matrix', emoji: '💚', label: 'Matrix', slash: '/matrix' },
  { id: 'ghost', emoji: '👻', label: 'Ghost', slash: '/ghost' },
  { id: 'gold', emoji: '✨', label: 'Gold', slash: '/gold' },
  { id: 'wave', emoji: '🌊', label: 'Wave', slash: '/wave' },
  { id: 'meteor', emoji: '☄️', label: 'Meteor', slash: '/meteor' },
  { id: 'laser', emoji: '🔴', label: 'Laser', slash: '/laser' },
  { id: 'pixel', emoji: '🟦', label: 'Pixel', slash: '/pixel' },
  { id: 'smoke', emoji: '💨', label: 'Smoke', slash: '/smoke' },
  { id: 'thunder', emoji: '🌩️', label: 'Thunder', slash: '/thunder' },
  { id: 'candy', emoji: '🍬', label: 'Candy', slash: '/candy' },
  { id: 'cyber', emoji: '🤖', label: 'Cyber', slash: '/cyber' },
  { id: 'nova', emoji: '🌟', label: 'NOVA', slash: '/nova' },
  { id: 'hologram', emoji: '📡', label: 'Holo', slash: '/hologram' },
  { id: 'toxic', emoji: '☢️', label: 'Toxic', slash: '/toxic' },
  { id: 'mirror', emoji: '🪞', label: 'Mirror', slash: '/mirror' },
  { id: 'pulse', emoji: '💓', label: 'Pulse', slash: '/pulse' },
  { id: 'eclipse', emoji: '🌘', label: 'Eclipse', slash: '/eclipse' },
  { id: 'drift', emoji: '🌀', label: 'Drift', slash: '/drift' },
  { id: 'spark', emoji: '💫', label: 'Spark', slash: '/spark' },
  { id: 'blizzard', emoji: '🌨️', label: 'Blizzard', slash: '/blizzard' },
  { id: 'portal', emoji: '🔮', label: 'Portal', slash: '/portal' },
  { id: 'shadow', emoji: '🖤', label: 'Shadow', slash: '/shadow' },
  { id: 'chrome', emoji: '🪙', label: 'Chrome', slash: '/chrome' },
  { id: 'venom', emoji: '🐍', label: 'Venom', slash: '/venom' },
  { id: 'aurora', emoji: '🌌', label: 'Aurora', slash: '/aurora' },
  { id: 'quake', emoji: '🌋', label: 'Quake', slash: '/quake' },
  { id: 'starfall', emoji: '🌠', label: 'Starfall', slash: '/starfall' },
  { id: 'bubble', emoji: '🫧', label: 'Bubble', slash: '/bubble' },
  { id: 'ember', emoji: '🧡', label: 'Ember', slash: '/ember' },
  { id: 'static', emoji: '📺', label: 'Static', slash: '/static' },
];

export const CHAT_MOODS = [
  { id: null, emoji: '⬛', label: 'Off' },
  { id: 'neon', emoji: '💜', label: 'Neon' },
  { id: 'ember', emoji: '🔥', label: 'Ember' },
  { id: 'ocean', emoji: '🌊', label: 'Ocean' },
  { id: 'toxic', emoji: '☢️', label: 'Toxic' },
  { id: 'midnight', emoji: '🌑', label: 'Midnight' },
];

const FX_IDS = MESSAGE_FX.map((f) => f.id);
const SLASH_RE = new RegExp(`^\\/(${FX_IDS.join('|')}|rng|random)\\b\\s*`, 'i');

const EMOJI_LEAD = {
  '🔥': 'fire', '❄️': 'ice', '❄': 'ice', '🎉': 'party', '🎊': 'party',
  '⚡': 'shock', '🌑': 'void', '💀': 'void', '💜': 'neon', '👾': 'glitch',
  '🌈': 'rainbow', '💥': 'boom', '💘': 'love', '💖': 'love', '💚': 'matrix',
  '👻': 'ghost', '✨': 'gold', '🌊': 'wave', '☄️': 'meteor', '☄': 'meteor',
  '🔴': 'laser', '🟦': 'pixel', '💨': 'smoke', '🌩️': 'thunder', '🌩': 'thunder',
  '🍬': 'candy', '🤖': 'cyber', '🌟': 'nova', '📡': 'hologram', '☢️': 'toxic',
  '🪞': 'mirror', '💓': 'pulse', '🌘': 'eclipse', '🌀': 'drift', '💫': 'spark',
  '🌨️': 'blizzard', '🌨': 'blizzard', '🔮': 'portal', '🖤': 'shadow', '🪙': 'chrome',
  '🐍': 'venom', '🌌': 'aurora', '🌋': 'quake', '🌠': 'starfall', '🫧': 'bubble',
  '🧡': 'ember', '📺': 'static',
};

const KEYWORD_FX = [
  { re: /\b(gg|wp|ez)\b/i, fx: 'gold' },
  { re: /\b(lol|ахах|хаха|лмао|lmao)\b/i, fx: 'party' },
  { re: /\b(love|любл|сердц|kiss)\b/i, fx: 'love' },
  { re: /\b(boom|бабах|взрыв)\b/i, fx: 'boom' },
  { re: /\b(hack|glitch|баг)\b/i, fx: 'glitch' },
  { re: /\b(fire|огонь|жжёт)\b/i, fx: 'fire' },
  { re: /\b(chill|холод|freeze)\b/i, fx: 'ice' },
  { re: /\b(nova|нова)\b/i, fx: 'nova' },
  { re: /\b(toxic|токсик)\b/i, fx: 'toxic' },
  { re: /\b(rain|дожд)\b/i, fx: 'wave' },
  { re: /\b(portal|портал)\b/i, fx: 'portal' },
  { re: /\b(quake|earthquake|тряс)\b/i, fx: 'quake' },
  { re: /\b(star|звезд)\b/i, fx: 'starfall' },
];

export const FX_HOTKEYS = MESSAGE_FX.slice(0, 9);

export const SCREEN_SHAKE_FX = new Set(['shock', 'boom', 'glitch', 'meteor', 'thunder', 'nova', 'laser', 'eclipse', 'toxic', 'quake', 'portal']);
export const SCREEN_FLASH_FX = new Set(['party', 'rainbow', 'gold', 'love', 'neon', 'candy', 'nova', 'cyber', 'hologram', 'spark', 'pulse', 'aurora', 'starfall', 'ember']);
export const CONFETTI_FX = new Set(['party', 'rainbow', 'gold', 'love', 'candy', 'nova', 'spark', 'starfall']);
export const STARFALL_FX = new Set(['starfall', 'aurora', 'nova', 'meteor']);

export function isValidFx(id) {
  return FX_IDS.includes(id);
}

export function getAllowedFxSet() {
  return new Set(FX_IDS);
}

export function pickRandomFx(excludeNova = false) {
  const pool = excludeNova ? MESSAGE_FX.filter((f) => f.id !== 'nova') : MESSAGE_FX;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function detectKeywordFx(text) {
  if (!text) return null;
  for (const row of KEYWORD_FX) {
    if (row.re.test(text)) return row.fx;
  }
  return null;
}

export function comboTierLabel(n) {
  if (n >= 20) return 'LEGENDARY';
  if (n >= 15) return 'GODLIKE';
  if (n >= 10) return 'ULTRA';
  if (n >= 7) return 'MEGA';
  if (n >= 5) return 'SUPER';
  return null;
}

export function rollCriticalHit(baseFx) {
  if (!baseFx || Math.random() > 0.12) return { fx: baseFx, critical: false };
  return { fx: baseFx === 'nova' ? 'nova' : baseFx, critical: true };
}

export function parseMessageFx(rawText, selectedFx = null) {
  let text = typeof rawText === 'string' ? rawText : '';
  let fx = selectedFx && isValidFx(selectedFx) ? selectedFx : null;

  const m = text.match(SLASH_RE);
  if (m) {
    const cmd = m[1].toLowerCase();
    fx = cmd === 'rng' || cmd === 'random' ? pickRandomFx() : cmd;
    text = text.slice(m[0].length);
  } else if (!fx) {
    const first = [...text][0];
    if (first && EMOJI_LEAD[first]) {
      const rest = text.slice(first.length).replace(/^\s+/, '');
      if (rest.length > 0 || text.trim().length <= 2) {
        fx = EMOJI_LEAD[first];
        if (rest.length > 0) text = rest;
      }
    }
  }

  if (!fx) fx = detectKeywordFx(text);
  return { fx: fx || null, text };
}

export function getMessageFx(message) {
  const fromMeta = message?.messageMeta?.fx;
  if (isValidFx(fromMeta)) return fromMeta;
  if (typeof message?.content === 'string') {
    const m = message.content.match(SLASH_RE);
    if (m) {
      const cmd = m[1].toLowerCase();
      if (cmd !== 'rng' && cmd !== 'random') return cmd;
    }
  }
  return null;
}

export function displayMessageContent(message) {
  return (message?.content || '').replace(SLASH_RE, '');
}

export function isMessageCritical(message) {
  return !!(message?.messageMeta?.critical);
}
