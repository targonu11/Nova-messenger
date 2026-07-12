/** Built-in Discord/Telegram-style slash commands (client-side) */
export const BUILTIN_SLASH_COMMANDS = [
  { command: 'me', descriptionKey: 'slashMe', hint: '/me …' },
  { command: 'shrug', descriptionKey: 'slashShrug', hint: '/shrug' },
  { command: 'tableflip', descriptionKey: 'slashTableflip', hint: '/tableflip' },
  { command: 'unflip', descriptionKey: 'slashUnflip', hint: '/unflip' },
  { command: 'lenny', descriptionKey: 'slashLenny', hint: '/lenny' },
  { command: 'poll', descriptionKey: 'slashPoll', hint: '/poll' },
  { command: 'spoiler', descriptionKey: 'slashSpoiler', hint: '/spoiler text' },
  { command: 'code', descriptionKey: 'slashCode', hint: '/code …' },
  { command: 'schedule', descriptionKey: 'slashSchedule', hint: '/schedule' },
];

export function filterBuiltinSlash(input) {
  if (!String(input || '').startsWith('/')) return [];
  const tail = input.slice(1);
  if (tail.includes(' ')) return [];
  const q = tail.toLowerCase();
  if (!q) return BUILTIN_SLASH_COMMANDS;
  return BUILTIN_SLASH_COMMANDS.filter((c) => c.command.startsWith(q));
}

/**
 * @returns {{ handled: boolean, content?: string, messageType?: string, openPoll?: boolean, openSchedule?: boolean, wrap?: [string, string] }}
 */
export function resolveBuiltinSlash(raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith('/')) return { handled: false };

  if (text === '/shrug' || text.startsWith('/shrug ')) {
    const rest = text.slice(6).trim();
    return { handled: true, content: rest ? `${rest} ¯\\_(ツ)_/¯` : '¯\\_(ツ)_/¯' };
  }
  if (text === '/tableflip' || text.startsWith('/tableflip ')) {
    const rest = text.slice(10).trim();
    return { handled: true, content: rest ? `${rest} (╯°□°)╯︵ ┻━┻` : '(╯°□°)╯︵ ┻━┻' };
  }
  if (text === '/unflip' || text.startsWith('/unflip ')) {
    const rest = text.slice(7).trim();
    return { handled: true, content: rest ? `${rest} ┬─┬ノ(º_ºノ)` : '┬─┬ノ(º_ºノ)' };
  }
  if (text === '/lenny' || text.startsWith('/lenny ')) {
    const rest = text.slice(6).trim();
    return { handled: true, content: rest ? `${rest} ( ͡° ͜ʖ ͡°)` : '( ͡° ͜ʖ ͡°)' };
  }
  if (text === '/poll' || text.startsWith('/poll ')) {
    return { handled: true, openPoll: true };
  }
  if (text === '/schedule' || text.startsWith('/schedule ')) {
    return { handled: true, openSchedule: true };
  }
  if (text.startsWith('/me ')) {
    const action = text.slice(4).trim();
    if (!action) return { handled: false };
    return { handled: true, content: action, messageType: 'action' };
  }
  if (text.startsWith('/spoiler ')) {
    const body = text.slice(9).trim();
    if (!body) return { handled: false };
    return { handled: true, content: `||${body}||` };
  }
  if (text.startsWith('/code ')) {
    const body = text.slice(6);
    if (!body.trim()) return { handled: false };
    return { handled: true, content: '```\n' + body + '\n```' };
  }
  return { handled: false };
}
