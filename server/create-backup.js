import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');
const uploadsDir = join(__dirname, 'uploads');
const backupRoot = join(__dirname, 'backups');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const name of fs.readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      count += copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
      count += 1;
    }
  }
  return count;
}

export function createFullBackup(label = 'manual') {
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not found: ' + dbPath);
  }
  fs.mkdirSync(backupRoot, { recursive: true });
  const dir = join(backupRoot, `nova-backup-${stamp()}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(dbPath, join(dir, 'messenger.db'));
  // совместимость со старым скриптом
  fs.copyFileSync(dbPath, join(__dirname, 'бекап 1.db'));
  const files = copyDir(uploadsDir, join(dir, 'uploads'));
  const dbSize = fs.statSync(dbPath).size;
  return { dir, dbSize, uploadFiles: files };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const result = createFullBackup('manual');
    console.log('✓ Backup created:', result.dir);
    console.log('  DB size:', (result.dbSize / 1024).toFixed(2), 'KB');
    console.log('  Upload files:', result.uploadFiles);
  } catch (error) {
    console.error('❌ Error creating backup:', error.message);
    process.exit(1);
  }
}
