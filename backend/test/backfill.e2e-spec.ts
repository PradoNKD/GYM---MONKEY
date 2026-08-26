import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionSource, SessionStatus, TimeEntryType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { converterTimeEntriesEmSessoes } from '../src/sessions/backfill';

// Converte o historico antigo (TimeEntry) em sessoes. Roda restrito aos
// usuarios criados aqui, senao pegaria carona nos usuarios deixados por outras
// suites no banco de teste.
describe('Backfill de TimeEntry para WorkoutSession (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const criados: string[] = [];

  async function novoUsuario(timezone = 'America/Sao_Paulo') {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `bf-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
        timezone,
      },
    });
    criados.push(u.id);
    return u;
  }

  async function registrar(userId: string, tipo: TimeEntryType, iso: string) {
    return prisma.timeEntry.create({
      data: { userId, type: tipo, timestamp: new Date(iso) },
    });
  }

  const converter = (userId: string) =>
    converterTimeEntriesEmSessoes(prisma, { userIds: [userId] });

  const sessoesDe = (userId: string) =>
    prisma.workoutSession.findMany({ where: { userId }, orderBy: { startedAt: 'asc' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  it('pareia check-in com check-out e calcula a duracao', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T13:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T14:30:00Z');

    const relatorio = await converter(u.id);

    expect(relatorio).toMatchObject({ usuariosProcessados: 1, sessoesCriadas: 1 });
    const [s] = await sessoesDe(u.id);
    expect(s).toMatchObject({
      status: SessionStatus.COMPLETED,
      durationMin: 90,
      source: SessionSource.BACKFILL,
    });
  });

  it('aplica a duracao minima: treino curto antigo vira SHORT', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T13:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T13:00:05Z');

    await converter(u.id);

    const [s] = await sessoesDe(u.id);
    // O historico e preservado, mas passa a valer a mesma regra do runtime:
    // os numeros antigos estavam inflados justamente por nao ter essa regra.
    expect(s.status).toBe(SessionStatus.SHORT);
    expect(s.durationMin).toBe(0);
  });

  it('trunca em 4h o treino antigo muito longo, sem perde-lo', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T10:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T15:00:00Z'); // 5h

    await converter(u.id);

    const [s] = await sessoesDe(u.id);
    expect(s).toMatchObject({ status: SessionStatus.COMPLETED, durationMin: 240 });
  });

  it('check-in sem fecho vira AUTO_CLOSED limitado a 6h', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T10:00:00Z');

    await converter(u.id);

    const [s] = await sessoesDe(u.id);
    expect(s.status).toBe(SessionStatus.AUTO_CLOSED);
    expect(s.durationMin).toBe(6 * 60);
    expect(s.endedAt!.toISOString()).toBe('2026-08-24T16:00:00.000Z');
  });

  it('dois check-in seguidos: o primeiro e fechado como esquecido', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T10:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-25T10:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-25T11:00:00Z');

    const relatorio = await converter(u.id);

    const sessoes = await sessoesDe(u.id);
    expect(sessoes).toHaveLength(2);
    expect(sessoes[0].status).toBe(SessionStatus.AUTO_CLOSED);
    expect(sessoes[1]).toMatchObject({ status: SessionStatus.COMPLETED, durationMin: 60 });
    expect(relatorio.autoFechadas).toBe(1);
  });

  it('check-out orfao e contado no relatorio e nao gera sessao', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T14:00:00Z');

    const relatorio = await converter(u.id);

    expect(relatorio.checkOutsOrfaos).toBe(1);
    expect(await sessoesDe(u.id)).toHaveLength(0);
  });

  it('o dayKey sai no fuso do usuario, nao em UTC', async () => {
    const u = await novoUsuario('America/Sao_Paulo');
    // 01:00 UTC do dia 27 = 22:00 do dia 26 em Sao Paulo.
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-27T01:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-27T02:00:00Z');

    await converter(u.id);

    const [s] = await sessoesDe(u.id);
    expect(s.dayKey).toBe('2026-08-26');
  });

  it('e idempotente: rodar duas vezes nao duplica o historico', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T13:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T14:00:00Z');

    await converter(u.id);
    const segunda = await converter(u.id);

    expect(segunda).toMatchObject({ usuariosPulados: 1, sessoesCriadas: 0 });
    expect(await sessoesDe(u.id)).toHaveLength(1);
  });

  it('nao apaga os TimeEntry: eles seguem como auditoria', async () => {
    const u = await novoUsuario();
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T13:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T14:00:00Z');

    await converter(u.id);

    expect(await prisma.timeEntry.count({ where: { userId: u.id } })).toBe(2);
  });

  it('vincula a sessao ao grupo do usuario', async () => {
    const u = await novoUsuario();
    const grupo = await prisma.group.findUnique({ where: { slug: 'gym-monkey' } });
    await prisma.membership.create({ data: { userId: u.id, groupId: grupo!.id } });
    await registrar(u.id, TimeEntryType.CHECK_IN, '2026-08-24T13:00:00Z');
    await registrar(u.id, TimeEntryType.CHECK_OUT, '2026-08-24T14:00:00Z');

    await converter(u.id);

    const [s] = await sessoesDe(u.id);
    expect(s.groupId).toBe(grupo!.id);
  });

  it('usuario sem historico nao gera nada', async () => {
    const u = await novoUsuario();

    const relatorio = await converter(u.id);

    expect(relatorio.sessoesCriadas).toBe(0);
    expect(await sessoesDe(u.id)).toHaveLength(0);
  });

  it('converte varios dias de uma vez, na ordem certa', async () => {
    const u = await novoUsuario();
    for (const dia of ['2026-08-20', '2026-08-21', '2026-08-22']) {
      await registrar(u.id, TimeEntryType.CHECK_IN, `${dia}T13:00:00Z`);
      await registrar(u.id, TimeEntryType.CHECK_OUT, `${dia}T14:00:00Z`);
    }

    await converter(u.id);

    const sessoes = await sessoesDe(u.id);
    expect(sessoes).toHaveLength(3);
    expect(sessoes.map((s) => s.dayKey)).toEqual(['2026-08-20', '2026-08-21', '2026-08-22']);
    expect(sessoes.every((s) => s.status === SessionStatus.COMPLETED)).toBe(true);
  });
});
