import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');

console.log('Force resetting database...');

// Удаляем базу данных несколько раз
for (let i = 0; i < 5; i++) {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`✓ Database deleted (attempt ${i + 1})`);
    } else {
      console.log('Database file does not exist');
    }
    break;
  } catch (e) {
    console.log(`Attempt ${i + 1} failed: ${e.message}`);
    if (i < 4) {
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.error('Failed to delete database after 5 attempts');
      console.error('Please stop the server and try again');
      process.exit(1);
    }
  }
}

console.log('\n✓ Database reset complete!');
console.log('Now start the server with: npm start');
console.log('The server will create a new database with 20 accounts.');
