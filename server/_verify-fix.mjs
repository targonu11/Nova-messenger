import crypto from 'node:crypto';
import { initDb, db } from './db.js';

await initDb();
const JWT_SECRET = 'nova-dev-secret-change-me';
function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlEncodeBuf(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlDecodeToString(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s + pad, 'base64').toString('utf8');
}
function signJwtHS256(payload, expiresInSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const p1 = base64UrlEncode(JSON.stringify(header));
  const p2 = base64UrlEncode(JSON.stringify(body));
  const data = `${p1}.${p2}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  return `${data}.${base64UrlEncodeBuf(sig)}`;
}
function verifyJwtHS256(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [p1, p2, p3] = parts;
  const data = `${p1}.${p2}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  const got = Buffer.from(String(p3).replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (p3.length % 4)) % 4), 'base64');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  return JSON.parse(base64UrlDecodeToString(p2));
}

const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const token = signJwtHS256({ userId: user.id, sid: 'x' }, 3600);
const payload = verifyJwtHS256(token);
console.log('jwt ok', payload?.userId === user.id);
