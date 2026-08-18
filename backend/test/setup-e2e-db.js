const { execSync } = require('child_process');
const path = require('path');
const { testDatabaseUrl } = require('./test-db-url');

// Garante que o banco de teste (Postgres) tem as tabelas antes do e2e.
// `migrate deploy` e nao-destrutivo e idempotente: cria as tabelas na primeira
// vez e vira no-op depois. Nao usamos `migrate reset` de proposito - ele apaga
// tudo e nao e necessario aqui, ja que cada teste usa e-mails unicos por
// execucao e so consulta os usuarios que ele mesmo cria, sem depender de um
// banco zerado. No CI o Postgres e um container novo a cada run, entao ja
// comeca limpo.
execSync('npx prisma migrate deploy', {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  stdio: 'inherit',
});
