const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const prismaDir = path.join(__dirname, '..', 'prisma');
const dbPath = path.join(prismaDir, 'test.db');
const journalPath = `${dbPath}-journal`;

for (const file of [dbPath, journalPath]) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

execSync('npx prisma migrate deploy', {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  stdio: 'inherit',
});
