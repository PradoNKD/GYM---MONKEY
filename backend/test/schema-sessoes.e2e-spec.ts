import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SessionsService } from '../src/sessions/sessions.service';

// Guarda os invariantes que a migration da v0.9 criou. Sao garantias de BANCO:
// se alguem mexer no schema e derrubar uma delas, estes testes quebram.
describe('Schema de sessoes e grupos (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let sessions: SessionsService;
  const criados: string[] = [];

  function emailUnico() {
    return `sessao-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function criarUsuario() {
    const u = await prisma.user.create({
      data: { name: 'Fulano', email: emailUnico(), passwordHash: 'x', active: true },
    });
    criados.push(u.id);
    return u;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    sessions = app.get(SessionsService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  it('o grupo padrao foi criado pela migration', async () => {
    const grupo = await prisma.group.findUnique({ where: { slug: 'gym-monkey' } });

    expect(grupo).not.toBeNull();
    expect(grupo!.name).toBe('GYM MONKEY');
  });

  it('usuario novo nasce com o fuso de Sao Paulo', async () => {
    const u = await criarUsuario();

    expect(u.timezone).toBe('America/Sao_Paulo');
  });

  it('o banco impede dois treinos abertos para a mesma pessoa', async () => {
    const u = await criarUsuario();
    await prisma.workoutSession.create({
      data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26' },
    });

    // Segunda sessao OPEN para o mesmo usuario viola o indice parcial.
    await expect(
      prisma.workoutSession.create({
        data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('depois de fechar a sessao, da pra abrir outra', async () => {
    const u = await criarUsuario();
    const aberta = await prisma.workoutSession.create({
      data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26' },
    });

    await prisma.workoutSession.update({
      where: { id: aberta.id },
      data: { status: 'COMPLETED', endedAt: new Date(), durationMin: 45 },
    });

    const nova = await prisma.workoutSession.create({
      data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26' },
    });
    expect(nova.status).toBe('OPEN');
  });

  it('duas pessoas podem ter treinos abertos ao mesmo tempo', async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();

    await prisma.workoutSession.create({
      data: { userId: a.id, startedAt: new Date(), dayKey: '2026-08-26' },
    });
    const outra = await prisma.workoutSession.create({
      data: { userId: b.id, startedAt: new Date(), dayKey: '2026-08-26' },
    });

    expect(outra.status).toBe('OPEN');
  });

  it('a correcao guarda autor, motivo e o antes/depois', async () => {
    const u = await criarUsuario();
    const sessao = await prisma.workoutSession.create({
      data: {
        userId: u.id,
        startedAt: new Date('2026-08-26T10:00:00Z'),
        dayKey: '2026-08-26',
        status: 'COMPLETED',
        endedAt: new Date('2026-08-26T11:00:00Z'),
        durationMin: 60,
      },
    });

    const correcao = await prisma.sessionCorrection.create({
      data: {
        sessionId: sessao.id,
        authorId: u.id,
        reason: 'Esqueci de finalizar',
        endedAtBefore: new Date('2026-08-26T11:00:00Z'),
        endedAtAfter: new Date('2026-08-26T11:30:00Z'),
      },
    });

    expect(correcao.reason).toBe('Esqueci de finalizar');
    expect(correcao.authorId).toBe(u.id);
    expect(correcao.endedAtAfter).toEqual(new Date('2026-08-26T11:30:00Z'));
  });

  it('apagar o autor anonimiza a correcao, sem apagar o rastro (LGPD)', async () => {
    const dono = await criarUsuario();
    const supervisor = await criarUsuario();
    const sessao = await prisma.workoutSession.create({
      data: { userId: dono.id, startedAt: new Date(), dayKey: '2026-08-26', status: 'COMPLETED' },
    });
    const correcao = await prisma.sessionCorrection.create({
      data: { sessionId: sessao.id, authorId: supervisor.id, reason: 'Ajuste do supervisor' },
    });

    // Excluir a conta tem de funcionar (nao pode ser bloqueado pela auditoria).
    await prisma.user.delete({ where: { id: supervisor.id } });

    const depois = await prisma.sessionCorrection.findUnique({ where: { id: correcao.id } });
    expect(depois).not.toBeNull();
    expect(depois!.reason).toBe('Ajuste do supervisor');
    expect(depois!.authorId).toBeNull();
  });

  it('conta nova nasce vinculada ao grupo padrao', async () => {
    const email = emailUnico();
    // Passa pelo cadastro de verdade, nao criando o User direto no banco.
    await request(server)
      .post('/auth/register')
      .send({ name: 'Novato', email, password: 'senha1234' })
      .expect(201);

    const criado = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { include: { group: true } } },
    });
    criados.push(criado!.id);

    expect(criado!.memberships).toHaveLength(1);
    expect(criado!.memberships[0].group.slug).toBe('gym-monkey');
  });

  it('a sessao de um usuario novo ja sai com grupo', async () => {
    const email = emailUnico();
    await request(server)
      .post('/auth/register')
      .send({ name: 'Novato', email, password: 'senha1234' })
      .expect(201);
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    criados.push(u!.id);

    const sessao = await sessions.abrir(u!.id);

    expect(sessao.groupId).not.toBeNull();
  });

  it('excluir a conta apaga o historico antigo junto (LGPD)', async () => {
    const u = await prisma.user.create({
      data: { name: 'Sai', email: emailUnico(), passwordHash: 'x', active: true },
    });
    await prisma.timeEntry.create({ data: { userId: u.id, type: 'CHECK_IN' } });
    await prisma.workoutSession.create({
      data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26', status: 'COMPLETED' },
    });

    // Sem o Cascade no TimeEntry, isto falhava com erro de chave estrangeira --
    // ou seja, nenhum usuario que ja bateu ponto poderia ser excluido.
    await prisma.user.delete({ where: { id: u.id } });

    expect(await prisma.timeEntry.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.workoutSession.count({ where: { userId: u.id } })).toBe(0);
  });

  it('apagar a sessao leva as correcoes junto (nao deixa orfao)', async () => {
    const u = await criarUsuario();
    const sessao = await prisma.workoutSession.create({
      data: { userId: u.id, startedAt: new Date(), dayKey: '2026-08-26', status: 'COMPLETED' },
    });
    await prisma.sessionCorrection.create({
      data: { sessionId: sessao.id, authorId: u.id, reason: 'teste' },
    });

    await prisma.workoutSession.delete({ where: { id: sessao.id } });

    expect(await prisma.sessionCorrection.count({ where: { sessionId: sessao.id } })).toBe(0);
  });
});
