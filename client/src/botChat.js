import { lookupUserByLogin } from './api';

export async function resolveBotUserId(login, users = []) {
  const name = String(login || '').replace(/^@/, '').trim();
  if (!name) return null;
  const local = users.find((u) => String(u.login) === name);
  if (local?.id) return local.id;
  try {
    const remote = await lookupUserByLogin(name);
    return remote?.id || null;
  } catch {
    return null;
  }
}

export async function resolveBotUser(login, users = []) {
  const name = String(login || '').replace(/^@/, '').trim();
  if (!name) return null;
  const local = users.find((u) => String(u.login) === name);
  if (local?.id) return local;
  try {
    return await lookupUserByLogin(name);
  } catch {
    return null;
  }
}
