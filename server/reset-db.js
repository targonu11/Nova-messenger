import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');

try {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✓ Database deleted successfully.');
    console.log('Start the server with: npm start');
    console.log('The server will create a new database with 20 accounts.');
  } else {
    console.log('No database file found. Database will be created on server start.');
  }
} catch (e) {
  console.error('Error deleting database:', e.message);
  process.exit(1);
}
