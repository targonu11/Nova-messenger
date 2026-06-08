import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');
const backupPath = join(__dirname, 'бекап 1.db');

try {
  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found:', dbPath);
    process.exit(1);
  }
  
  // Копируем файл базы данных
  fs.copyFileSync(dbPath, backupPath);
  console.log('✓ Backup created successfully: бекап 1.db');
  console.log('  Source:', dbPath);
  console.log('  Backup:', backupPath);
  
  // Проверяем размер файлов
  const dbStats = fs.statSync(dbPath);
  const backupStats = fs.statSync(backupPath);
  console.log('  Database size:', dbStats.size, 'bytes');
  console.log('  Backup size:', backupStats.size, 'bytes');
} catch (error) {
  console.error('Error creating backup:', error.message);
  process.exit(1);
}
