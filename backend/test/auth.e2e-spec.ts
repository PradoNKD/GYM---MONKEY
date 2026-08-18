import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Autenticacao (e2e)', () => {
  let app: INestApplication;

  const senhaValida = 'senha1234';

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Cada teste ganha sua propria instancia da aplicacao. O ThrottlerGuard
  // (5 registros/logins por 60s, ver auth.controller.ts) e global e guarda
  // seu contador em memoria por instancia da app - reaproveitar uma unica
  // app entre testes faria varios deles baterem no 429 sem relacao com o
  // que estao de fato testando. O rate limiting em si tem suite propria em
  // throttle.e2e-spec.ts.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('cria o usuario e retorna token + dados do usuario, sem hash de senha', async () => {
      const email = emailUnico('registro-ok');

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Usuario Teste', email, password: senhaValida })
        .expect(201);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toMatchObject({ name: 'Usuario Teste', email });
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('rejeita e-mail duplicado com 409', async () => {
      const email = emailUnico('duplicado');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Primeiro', email, password: senhaValida })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Segundo', email, password: senhaValida })
        .expect(409);
    });

    it('rejeita senha sem numero com 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Senha Fraca',
          email: emailUnico('senha-fraca'),
          password: 'apenasletras',
        })
        .expect(400);
    });

    it('rejeita senha curta com 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Senha Curta',
          email: emailUnico('senha-curta'),
          password: 'a1b2',
        })
        .expect(400);
    });

    it('rejeita e-mail invalido com 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Email Invalido', email: 'nao-e-email', password: senhaValida })
        .expect(400);
    });

    it('rejeita campos desconhecidos no corpo com 400 (whitelist do ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Campo Extra',
          email: emailUnico('campo-extra'),
          password: senhaValida,
          isAdmin: true,
        })
        .expect(400);
    });

    it('normaliza o e-mail: registrar com maiusculas permite login com e-mail em minusculas', async () => {
      const emailBase = emailUnico('case-insensitive');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Case Test',
          email: emailBase.toUpperCase(),
          password: senhaValida,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailBase.toLowerCase(), password: senhaValida })
        .expect(200);
    });

    it('rejeita e-mail com espacos nas bordas com 400 (IsEmail nao aceita padding)', async () => {
      const email = emailUnico('com-espacos');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Com Espacos', email: `  ${email}  `, password: senhaValida })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('retorna token com credenciais corretas', async () => {
      const email = emailUnico('login-ok');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Login OK', email, password: senhaValida })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: senhaValida })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
    });

    it('rejeita senha errada com 401', async () => {
      const email = emailUnico('login-senha-errada');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Login Senha Errada', email, password: senhaValida })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'outraSenha1' })
        .expect(401);
    });

    it('rejeita e-mail que nao existe com 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailUnico('nao-existe'), password: senhaValida })
        .expect(401);
    });
  });
});
