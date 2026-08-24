import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Autenticacao (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senhaValida = 'senha1234';

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Ativa uma conta direto no banco, simulando a aprovacao do supervisor,
  // para os testes que precisam de um usuario que consiga logar.
  async function aprovar(email: string) {
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { active: true },
    });
  }

  // App novo por teste: o armazenamento em memoria do ThrottlerGuard zera junto,
  // entao o rate limit nao vaza entre casos.
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
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('cria a conta como pendente e NAO devolve token', async () => {
      const email = emailUnico('registro-ok');

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Usuario Teste', email, password: senhaValida })
        .expect(201);

      expect(response.body.status).toBe('pending_approval');
      expect(response.body).not.toHaveProperty('accessToken');
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

    it('normaliza o e-mail: cadastra com maiusculas e loga (apos aprovar) com minusculas', async () => {
      const emailBase = emailUnico('case-insensitive');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Case Test', email: emailBase.toUpperCase(), password: senhaValida })
        .expect(201);

      await aprovar(emailBase);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailBase.toLowerCase(), password: senhaValida })
        .expect(200);
    });
  });

  describe('POST /auth/login', () => {
    it('bloqueia login de conta recem-criada (pendente) com 403', async () => {
      const email = emailUnico('pendente');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Pendente', email, password: senhaValida })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: senhaValida })
        .expect(403);
    });

    it('retorna token (com role) apos a conta ser aprovada', async () => {
      const email = emailUnico('login-ok');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Login OK', email, password: senhaValida })
        .expect(201);
      await aprovar(email);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: senhaValida })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.role).toBe('USER');
    });

    it('rejeita senha errada com 401 (mesmo com a conta aprovada)', async () => {
      const email = emailUnico('login-senha-errada');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Login Senha Errada', email, password: senhaValida })
        .expect(201);
      await aprovar(email);

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
