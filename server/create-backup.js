import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');
const backupPath = join(__dirname, 'бекап 1.db');

try {
  // Проверяем существование файла БД
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found:', dbPath);
    console.log('   The database might be created on first server start.');
    process.exit(1);
  }
  
  // Копируем файл базы данных
  fs.copyFileSync(dbPath, backupPath);
  
  // Проверяем размер файлов
  const dbStats = fs.statSync(dbPath);
  const backupStats = fs.statSync(backupPath);
  
  console.log('✓ Backup created successfully!');
  console.log('  Source: messenger.db');
  console.log('  Backup: бекап 1.db');
  console.log('  Database size:', (dbStats.size / 1024).toFixed(2), 'KB');
  console.log('  Backup size:', (backupStats.size / 1024).toFixed(2), 'KB');
  
  if (dbStats.size === backupStats.size) {
    console.log('  ✓ Backup size matches database size');
  } else {
    console.warn('  ⚠ Warning: Backup size differs from database size');
  }
} catch (error) {
  console.error('❌ Error creating backup:', error.message);
  console.error(error.stack);
  process.exit(1);
}
