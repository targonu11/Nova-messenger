import { initDb, db } from './db.js';

async function showAccounts() {
  try {
    await initDb();
    
    const users = db.prepare('SELECT login, password, display_name FROM users ORDER BY login').all();
    
    if (users.length === 0) {
      console.log('No accounts found in database.');
      return;
    }
    
    console.log('\n=== Все аккаунты и пароли ===\n');
    users.forEach((user, index) => {
      console.log(`${index + 1}. Логин: ${user.login}`);
      console.log(`   Пароль: ${user.password}`);
      console.log(`   Имя: ${user.display_name}`);
      console.log('');
    });
    console.log('==============================\n');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

showAccounts();
