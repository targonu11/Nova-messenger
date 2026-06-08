import initSqlJs from 'sql.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');
const outputPath = join(__dirname, '..', 'accounts.txt');

async function exportAccounts() {
  let SQL = null;
  let dbInstance = null;
  
  try {
    // Загружаем SQL.js
    SQL = await initSqlJs();
    
    // Проверяем существование базы данных
    if (!fs.existsSync(dbPath)) {
      console.log('❌ База данных не найдена. Запустите сервер сначала: npm start');
      console.log('   Сервер создаст базу данных и аккаунты при первом запуске.\n');
      process.exit(1);
    }
    
    // Загружаем существующую базу данных (только чтение)
    const data = new Uint8Array(fs.readFileSync(dbPath));
    dbInstance = new SQL.Database(data);
    
    // Читаем пользователей из базы
    const stmt = dbInstance.prepare('SELECT login, password, display_name FROM users ORDER BY login');
    const users = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject();
      users.push({
        login: row.login,
        password: row.password,
        display_name: row.display_name
      });
    }
    stmt.free();
    
    if (users.length === 0) {
      console.log('❌ Аккаунты не найдены в базе данных.');
      console.log('   Запустите сервер: npm start\n');
      process.exit(1);
    }
    
    // Формируем содержимое файла
    let content = '=== Все аккаунты и пароли ===\n\n';
    
    users.forEach((user, index) => {
      content += `${index + 1}. Юзернейм: ${user.login}\n`;
      content += `   Пароль: ${user.password}\n`;
      content += `   Имя: ${user.display_name}\n\n`;
    });
    
    content += '==============================\n';
    content += `Всего аккаунтов: ${users.length}\n`;
    content += `Дата экспорта: ${new Date().toLocaleString('ru-RU')}\n`;
    
    // Сохраняем в файл
    fs.writeFileSync(outputPath, content, 'utf-8');
    
    console.log(`\n✅ Список аккаунтов сохранен в файл: accounts.txt`);
    console.log(`📁 Путь: ${outputPath}\n`);
    console.log('=== Список аккаунтов ===\n');
    console.log(content);
    
    // Закрываем базу данных
    dbInstance.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch (e) {
        // Игнорируем ошибки при закрытии
      }
    }
    process.exit(1);
  }
}

exportAccounts();
