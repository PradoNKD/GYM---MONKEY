import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users / painel de supervisor (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  const senha = 'senha1234';

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function registrar(email: string) {
    await request(server)
      .post('/auth/register')
      .send({ name: 'Fulano', email, password: senha })
      .expect(201);
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async function definir(email: string, data: { active?: boolean; role?: 'USER' | 'SUPERVISOR' }) {
    await prisma.user.update({ where: { email: email.toLowerCase() }, data });
  }

  async function logar(email: string) {
    const r = await request(server)
      .post('/auth/login')
      .send({ email, password: senha })
      .expect(200);
    return r.body.accessToken as string;
  }

  // App nova por teste: cada caso faz varios register/login, e o throttler
  // (5/min) e por instancia da app, entao reiniciar zera a contagem e o rate
  // limit nao vaza entre os testes. (O rate limit em si tem suite propria.)
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
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('exige autenticacao em GET /users (401 sem token)', async () => {
    await request(server).get('/users').expect(401);
  });

  it('um usuario comum (ativo) nao acessa o painel: GET /users -> 403', async () => {
    const email = emailUnico('comum');
    await registrar(email);
    await definir(email, { active: true, role: 'USER' });
    const token = await logar(email);

    await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('supervisor lista os usuarios (sem passwordHash)', async () => {
    const supEmail = emailUnico('sup-lista');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const token = await logar(supEmail);

    const response = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    const eu = response.body.find((u: { email: string }) => u.email === supEmail.toLowerCase());
    expect(eu).toMatchObject({ role: 'SUPERVISOR', active: true });
    expect(eu).not.toHaveProperty('passwordHash');
  });

  it('supervisor aprova (ativa) uma conta pendente, que passa a conseguir logar', async () => {
    const supEmail = emailUnico('sup-aprova');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);

    const pendente = emailUnico('pendente');
    const novo = await registrar(pendente);

    // antes de aprovar, nao loga
    await request(server)
      .post('/auth/login')
      .send({ email: pendente, password: senha })
      .expect(403);

    // supervisor aprova
    await request(server)
      .patch(`/users/${novo!.id}`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ active: true })
      .expect(200);

    // agora loga
    await request(server)
      .post('/auth/login')
      .send({ email: pendente, password: senha })
      .expect(200);
  });

  it('supervisor desativa uma conta e o token que ela tinha para de valer', async () => {
    const supEmail = emailUnico('sup-desativa');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);

    const alvoEmail = emailUnico('alvo');
    const alvo = await registrar(alvoEmail);
    await definir(alvoEmail, { active: true });
    const alvoToken = await logar(alvoEmail);

    // com a conta ativa, o token funciona
    await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${alvoToken}`)
      .expect(200);

    // supervisor desativa
    await request(server)
      .patch(`/users/${alvo!.id}`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ active: false })
      .expect(200);

    // o token que o alvo ja tinha deixa de valer
    await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${alvoToken}`)
      .expect(401);
  });

  it('supervisor nao pode desativar a propria conta (anti-lockout) -> 403', async () => {
    const supEmail = emailUnico('sup-self');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);
    const eu = await prisma.user.findUnique({ where: { email: supEmail.toLowerCase() } });

    await request(server)
      .patch(`/users/${eu!.id}`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ active: false })
      .expect(403);
  });

  it('PATCH em id inexistente (UUID valido) -> 404', async () => {
    const supEmail = emailUnico('sup-404');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);

    await request(server)
      .patch('/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${supToken}`)
      .send({ active: true })
      .expect(404);
  });

  it('PATCH com id que nao e UUID -> 400', async () => {
    const supEmail = emailUnico('sup-uuid');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);

    await request(server)
      .patch('/users/nao-e-uuid')
      .set('Authorization', `Bearer ${supToken}`)
      .send({ active: true })
      .expect(400);
  });

  it('PATCH rejeita role invalido -> 400', async () => {
    const supEmail = emailUnico('sup-role');
    await registrar(supEmail);
    await definir(supEmail, { active: true, role: 'SUPERVISOR' });
    const supToken = await logar(supEmail);
    const alvo = await registrar(emailUnico('alvo-role'));

    await request(server)
      .patch(`/users/${alvo!.id}`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ role: 'ADMIN' })
      .expect(400);
  });
});
