import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Time entries / check-in-check-out (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  let tokenUserA: string;
  let tokenUserB: string;

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Novo usuario entra inativo: registra, aprova direto no banco (como faria o
  // supervisor) e loga pra pegar o token.
  async function registrarAtivoELogar(nome: string, prefixoEmail: string) {
    const email = emailUnico(prefixoEmail);
    await request(server)
      .post('/auth/register')
      .send({ name: nome, email, password: 'senha1234' })
      .expect(201);
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { active: true },
    });
    const login = await request(server)
      .post('/auth/login')
      .send({ email, password: 'senha1234' })
      .expect(200);
    return login.body.accessToken as string;
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

    tokenUserA = await registrarAtivoELogar('Usuario A', 'user-a');
    tokenUserB = await registrarAtivoELogar('Usuario B', 'user-b');
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia acesso sem token (401)', async () => {
    await request(server).get('/time-entries').expect(401);
    await request(server).post('/time-entries/toggle').expect(401);
  });

  it('bloqueia acesso com token invalido (401)', async () => {
    await request(server)
      .get('/time-entries')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  let idPrimeiroRegistro: string;
  let idSegundoRegistro: string;

  it('primeiro toggle do usuario cria CHECK_IN', async () => {
    const response = await request(server)
      .post('/time-entries/toggle')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(201);

    expect(response.body.type).toBe('CHECK_IN');
    idPrimeiroRegistro = response.body.id;
  });

  it('segundo toggle do mesmo usuario cria CHECK_OUT', async () => {
    const response = await request(server)
      .post('/time-entries/toggle')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(201);

    expect(response.body.type).toBe('CHECK_OUT');
    idSegundoRegistro = response.body.id;
  });

  it('GET /time-entries retorna os registros do usuario, mais recente primeiro', async () => {
    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].id).toBe(idSegundoRegistro);
    expect(response.body[1].id).toBe(idPrimeiroRegistro);
  });

  it('isola dados entre usuarios: usuario B nao ve os registros do usuario A', async () => {
    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(200);

    expect(response.body).toHaveLength(0);
  });

  it('PATCH permite ao proprio usuario corrigir o horario de um registro', async () => {
    const novoHorario = '2026-08-18T09:00:00.000Z';

    const response = await request(server)
      .patch(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({ timestamp: novoHorario })
      .expect(200);

    expect(new Date(response.body.timestamp).toISOString()).toBe(novoHorario);
  });

  it('PATCH rejeita data em formato invalido com 400', async () => {
    await request(server)
      .patch(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({ timestamp: 'nao-e-uma-data' })
      .expect(400);
  });

  it('PATCH rejeita id que nao e um UUID valido com 400', async () => {
    await request(server)
      .patch('/time-entries/id-invalido')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({ timestamp: '2026-08-18T09:00:00.000Z' })
      .expect(400);
  });

  it('PATCH em registro de outro usuario retorna 404 (nao revela que o registro existe)', async () => {
    await request(server)
      .patch(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({ timestamp: '2026-08-18T09:00:00.000Z' })
      .expect(404);
  });

  it('DELETE em registro de outro usuario retorna 404 e nao apaga o registro', async () => {
    await request(server)
      .delete(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(404);

    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);
    expect(response.body.map((entry: { id: string }) => entry.id)).toContain(
      idPrimeiroRegistro,
    );
  });

  it('DELETE com id inexistente (mas UUID valido) retorna 404', async () => {
    await request(server)
      .delete('/time-entries/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(404);
  });

  it('DELETE remove o registro do proprio usuario (204)', async () => {
    await request(server)
      .delete(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(204);

    const response = await request(server)
      .get('/time-entries')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);
    expect(response.body.map((entry: { id: string }) => entry.id)).not.toContain(
      idPrimeiroRegistro,
    );
  });

  it('DELETE repetido no mesmo id agora retorna 404 (ja foi removido)', async () => {
    await request(server)
      .delete(`/time-entries/${idPrimeiroRegistro}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(404);
  });
});
