/**
 * Reset all human account passwords to a simple shared password.
 * Stop the Nova server before running: node reset-passwords.mjs
 */
import { initDb, db, save } from './db.js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NEW_PASSWORD = 'nova1234';
const __dirname = dirname(fileURLToPath(import.meta.url));

await initDb();

const users = db.prepare(`
  SELECT id, login, display_name, COALESCE(is_bot, 0) AS is_bot
  FROM users
  ORDER BY login
`).all();

const humans = users.filter((u) => Number(u.is_bot) !== 1);
const upd = db.prepare('UPDATE users SET password = ? WHERE id = ?');

for (const u of humans) {
  upd.run(NEW_PASSWORD, u.id);
}

save();

const accountsFilePath = join(__dirname, '..', 'accounts.txt');
let content = '=== Все аккаунты и пароли ===\n\n';
humans.forEach((u, index) => {
  content += `${index + 1}. Юзернейм: ${u.login}\n   Пароль: ${NEW_PASSWORD}\n   Имя: ${u.display_name}\n\n`;
});
content += `==============================\nВсего записей: ${humans.length}\n`;
content += `Дата обновления: ${new Date().toLocaleString('ru-RU')}\n`;
content += `Общий пароль для всех: ${NEW_PASSWORD}\n`;
fs.writeFileSync(accountsFilePath, content, 'utf-8');

console.log(`Reset ${humans.length} accounts. Shared password set. accounts.txt updated.`);
process.exit(0);
