import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Prova, num processo de verdade, que o app se recusa a carregar com uma
 * config insegura. Em vez de brigar com o cache de modulos do jest (o
 * ConfigModule.forRoot roda o validate no import de app.module, uma unica vez
 * por processo), cada caso sobe um `node` novo que so requer o app.module: o
 * forRoot roda e lanca, o processo sai com codigo != 0 e a mensagem vai pro
 * stderr. Os casos de logica isolada ficam em src/config/env.validation.spec.ts.
 */
describe('Guarda de boot (e2e)', () => {
  const backendDir = join(__dirname, '..');

  function tentarCarregar(env: Record<string, string>) {
    return spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', "require('./src/app.module')"],
      {
        cwd: backendDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}',
          DATABASE_URL: 'file:./dev.db',
          JWT_SECRET: 'x'.repeat(32),
          ...env,
        },
      },
    );
  }

  it('nao carrega com JWT_SECRET vazio (evita o bypass de autenticacao)', () => {
    const r = tentarCarregar({ JWT_SECRET: '' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/JWT_SECRET/);
  });

  it('nao carrega com JWT_SECRET curto', () => {
    const r = tentarCarregar({ JWT_SECRET: 'curto-demais' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/32 caracteres/);
  });

  it('nao carrega com o JWT_SECRET de placeholder', () => {
    const r = tentarCarregar({ JWT_SECRET: 'troque-este-valor-por-um-segredo-forte' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/placeholder/);
  });

  it('nao carrega com DATABASE_URL vazio', () => {
    const r = tentarCarregar({ DATABASE_URL: '' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/DATABASE_URL/);
  });

  it('carrega normalmente com uma config valida (controle)', () => {
    const r = tentarCarregar({});
    expect(r.status).toBe(0);
  });
});
