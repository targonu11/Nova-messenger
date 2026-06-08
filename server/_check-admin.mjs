import { initDb, db, grantMainAdminPerks } from './db.js';

process.env.NOVA_SKIP_DB_LOCK = '1';
await initDb();
grantMainAdminPerks();

const u = db.prepare(`
  SELECT id, login, display_name, is_verified, selected_badge_id, avatar_ring, bio, birthday,
         custom_status_text, custom_status_emoji, avatar_path, cover_path
  FROM users WHERE login = ?
`).get('lololowkid');

if (!u) {
  console.log('ERROR: lololowkid not found in DB');
  const similar = db.prepare("SELECT login, id FROM users WHERE login LIKE '%lol%' LIMIT 20").all();
  console.log('Similar:', similar);
  process.exit(1);
}

const badges = db.prepare(`
  SELECT a.id, a.name, a.icon FROM user_achievements ua
  JOIN achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = ?
  ORDER BY a.name
`).all(u.id);

console.log('=== lololowkid ===');
console.log(JSON.stringify({ ...u, badgeCount: badges.length }, null, 2));
console.log('=== badges ===');
badges.forEach((b) => console.log(`  ${b.icon} ${b.id} — ${b.name}`));
