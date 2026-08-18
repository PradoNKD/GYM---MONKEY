/**
 * Validacao das variaveis de ambiente, rodada pelo ConfigModule no boot.
 * Se algo obrigatorio estiver faltando ou fraco, o app NAO sobe - e melhor
 * falhar no deploy do que subir com autenticacao quebrada.
 *
 * O caso critico: sem JWT_SECRET, o NestJS assina e aceita tokens com segredo
 * indefinido, o que e um bypass de autenticacao. Aqui isso vira um erro de boot.
 */

const MIN_JWT_SECRET_LENGTH = 32;

const PLACEHOLDER_SECRETS = new Set([
  'troque-este-valor-por-um-segredo-forte',
  'secret',
  'changeme',
  'jwt-secret',
]);

export interface ValidatedEnv {
  JWT_SECRET: string;
  DATABASE_URL: string;
  PORT: number;
  FRONTEND_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const erros: string[] = [];

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (!jwtSecret) {
    erros.push('JWT_SECRET e obrigatorio (sem ele a autenticacao pode ser burlada)');
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    erros.push(
      `JWT_SECRET precisa ter no minimo ${MIN_JWT_SECRET_LENGTH} caracteres (tem ${jwtSecret.length})`,
    );
  } else if (PLACEHOLDER_SECRETS.has(jwtSecret.toLowerCase())) {
    erros.push('JWT_SECRET esta com um valor de exemplo/placeholder - gere um segredo forte');
  }

  const databaseUrl = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL : '';
  if (!databaseUrl) {
    erros.push('DATABASE_URL e obrigatorio');
  }

  let port = 3000;
  if (config.PORT !== undefined && config.PORT !== '') {
    port = Number(config.PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      erros.push(`PORT invalido: ${String(config.PORT)}`);
    }
  }

  const frontendUrl =
    typeof config.FRONTEND_URL === 'string' && config.FRONTEND_URL
      ? config.FRONTEND_URL
      : undefined;

  if (erros.length > 0) {
    throw new Error(
      'Configuracao invalida - o app nao vai subir:\n  - ' + erros.join('\n  - '),
    );
  }

  return { JWT_SECRET: jwtSecret, DATABASE_URL: databaseUrl, PORT: port, FRONTEND_URL: frontendUrl };
}
