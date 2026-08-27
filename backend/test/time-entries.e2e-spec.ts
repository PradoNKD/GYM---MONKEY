import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// /time-entries ficou SOMENTE LEITURA na auditoria de seguranca de 2026-08-27.
// Estes testes cobrem as duas metades disso: a leitura continua funcionando e
// isolada por usuario, e as rotas de escrita nao existem mais para ninguem.
describe('Time entries / auditoria somente-leitura (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  let tokenUserA: string;
  let tokenUserB: string;
  let emailUserA: string;
  let emailUserB: string;

  // Registros criados direto no banco: nao existe mais rota que os crie. Sao
  // dados historicos, de antes do backfill da v0.9.
  let idAntigo: string;
  let idRecente: string;

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Novo usuario entra inativo: registra, aprova direto no banco (como faria o
  // supervisor) e loga pra pegar o token.
  async function registrarAtivoELogar(nome: string, prefixoEmail: string) {
    const email = emailUnico(prefixoEmail).toLowerCase();
    await request(server)
      .post('/auth/register')
      .send({ name: nome, email, password: 'senha1234' })
      .expect(201);
    await prisma.user.update({ where: { email }, data: { active: true } });
    const login = await request(server)
      .post('/auth/login')
      .send({ email, password: 'senha1234' })
      .expect(200);
    return { email, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
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

    const a = await registrarAtivoELogar('Usuario A', 'user-a');
    const b = await registrarAtivoELogar('Usuario B', 'user-b');
    tokenUserA = a.token;
    emailUserA = a.email;
    tokenUserB = b.token;
    emailUserB = b.email;

    const userA = await prisma.user.findUniqueOrThrow({
      where: { email: emailUserA },
    });

    const antigo = await prisma.timeEntry.create({
      data: {
        userId: userA.id,
        type: 'CHECK_IN',
        timestamp: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
    const recente = await prisma.timeEntry.create({
      data: {
        userId: userA.id,
        type: 'CHECK_OUT',
        timestamp: new Date('2026-08-18T10:30:00.000Z'),
      },
    });
    idAntigo = antigo.id;
    idRecente = recente.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia acesso sem token (401)', async () => {
    await request(server).get('/time-entries').expect(401);
  });

  it('bloqueia acesso com token invalido (401)', async () => {
    await request(server)
      .get('/time-entries')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('GET /time-entries retorna os registros do usuario, mais recente primeiro', async () => {
    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].id).toBe(idRecente);
    expect(response.body[1].id).toBe(idAntigo);
  });

  it('isola dados entre usuarios: usuario B nao ve os registros do usuario A', async () => {
    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(200);

    expect(response.body).toHaveLength(0);
  });

  describe('rotas de escrita removidas', () => {
    // O cutover da v0.9 tirou essas rotas da tela, mas elas seguiram no ar: com
    // um token comum dava pra reescrever o horario de um registro com valor
    // vindo do cliente (sem motivo, sem rastro) e apagar registros. Era
    // exatamente o furo que a v0.9 existiu pra fechar. 404 = rota inexistente.
    it('POST /time-entries/toggle nao existe mais (404)', async () => {
      await request(server)
        .post('/time-entries/toggle')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(404);
    });

    it('PATCH /time-entries/:id nao existe mais (404)', async () => {
      await request(server)
        .patch(`/time-entries/${idAntigo}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ timestamp: '2020-01-01T00:00:00.000Z' })
        .expect(404);
    });

    it('DELETE /time-entries/:id nao existe mais (404)', async () => {
      await request(server)
        .delete(`/time-entries/${idAntigo}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(404);
    });

    it('e os registros continuam no banco depois das tentativas', async () => {
      const response = await request(server)
        .get('/time-entries')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const ids = response.body.map((e: { id: string }) => e.id);
      expect(ids).toContain(idAntigo);
      expect(ids).toContain(idRecente);
    });

    it('nem para supervisor: a rota nao existe pra ninguem', async () => {
      await prisma.user.update({
        where: { email: emailUserB },
        data: { role: 'SUPERVISOR' },
      });
      const login = await request(server)
        .post('/auth/login')
        .send({ email: emailUserB, password: 'senha1234' })
        .expect(200);

      await request(server)
        .delete(`/time-entries/${idAntigo}`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(404);
    });
  });
});
