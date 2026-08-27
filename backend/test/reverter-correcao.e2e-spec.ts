import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionSource, SessionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  listarSessoesCorrigidas,
  reverterCorrecao,
} from '../src/sessions/reverter-correcao';

// Desfaz correcoes usando o que a auditoria guardou. Existe por causa de um caso
// real: antes da trava de aumento, uma sessao de 1 minuto virou 240 minutos
// contaveis em producao. A trava impede novas -- este script conserta a antiga.
describe('Reversao de correcao (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const criados: string[] = [];

  async function novoUsuario(timezone = 'America/Sao_Paulo') {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `rev-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
        timezone,
      },
    });
    criados.push(u.id);
    return u;
  }

  /**
   * Monta o estado exato do caso do Flavio: sessao curta que foi esticada, com a
   * trilha de auditoria que a correcao deixou.
   */
  async function sessaoEsticada(opcoes: {
    userId: string;
    inicio: Date;
    minutosOriginais: number;
    statusOriginal: SessionStatus;
    minutosDepois: number;
  }) {
    const { userId, inicio, minutosOriginais, statusOriginal, minutosDepois } = opcoes;
    const fimOriginal = new Date(inicio.getTime() + minutosOriginais * 60000);
    const fimEsticado = new Date(inicio.getTime() + minutosDepois * 60000);

    const sessao = await prisma.workoutSession.create({
      data: {
        userId,
        startedAt: inicio,
        endedAt: fimEsticado,
        durationMin: Math.min(minutosDepois, 240),
        status: SessionStatus.COMPLETED,
        source: SessionSource.CORRECTION,
        dayKey: '2026-08-26',
      },
    });

    await prisma.sessionCorrection.create({
      data: {
        sessionId: sessao.id,
        authorId: userId,
        reason: 'esqueci de finalizar',
        startedAtBefore: inicio,
        startedAtAfter: inicio,
        endedAtBefore: fimOriginal,
        endedAtAfter: fimEsticado,
        statusBefore: statusOriginal,
        statusAfter: SessionStatus.COMPLETED,
      },
    });

    return sessao;
  }

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

  it('devolve os horarios que o app tinha gravado (o caso do Flavio)', async () => {
    const u = await novoUsuario();
    const inicio = new Date(Date.UTC(2026, 7, 26, 12, 0));
    const s = await sessaoEsticada({
      userId: u.id,
      inicio,
      minutosOriginais: 1,
      statusOriginal: SessionStatus.SHORT,
      minutosDepois: 240,
    });

    const r = await reverterCorrecao(prisma, s.id, { aplicar: true });

    expect(r.antes).toMatchObject({ durationMin: 240, status: SessionStatus.COMPLETED });
    expect(r.depois).toMatchObject({ durationMin: 1, status: SessionStatus.SHORT });

    const depois = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(depois.durationMin).toBe(1);
    expect(depois.status).toBe(SessionStatus.SHORT);
    expect(depois.endedAt?.toISOString()).toBe(
      new Date(inicio.getTime() + 60000).toISOString(),
    );
    // Quem escreveu por ultimo foi manutencao, nao o app nem o usuario.
    expect(depois.source).toBe(SessionSource.SYSTEM);
  });

  it('simula por padrao: sem --confirmar nada e escrito', async () => {
    const u = await novoUsuario();
    const s = await sessaoEsticada({
      userId: u.id,
      inicio: new Date(Date.UTC(2026, 7, 26, 12, 0)),
      minutosOriginais: 1,
      statusOriginal: SessionStatus.SHORT,
      minutosDepois: 240,
    });

    const r = await reverterCorrecao(prisma, s.id);

    expect(r.aplicado).toBe(false);
    expect(r.depois.durationMin).toBe(1); // o relatorio ja mostra o resultado
    const intacta = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(intacta.durationMin).toBe(240); // mas o banco nao mudou
    expect(await prisma.sessionCorrection.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('a reversao ENTRA na trilha em vez de apagar o que houve', async () => {
    // A auditoria e somente-append: desfazer tambem tem de deixar rastro, senao
    // o historico passa a mentir na direcao oposta.
    const u = await novoUsuario();
    const s = await sessaoEsticada({
      userId: u.id,
      inicio: new Date(Date.UTC(2026, 7, 26, 12, 0)),
      minutosOriginais: 1,
      statusOriginal: SessionStatus.SHORT,
      minutosDepois: 240,
    });

    await reverterCorrecao(prisma, s.id, { aplicar: true });

    const trilha = await prisma.sessionCorrection.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(trilha).toHaveLength(2);
    // A correcao original continua la, com o que ela fez.
    expect(trilha[0].reason).toBe('esqueci de finalizar');
    expect(trilha[0].statusAfter).toBe(SessionStatus.COMPLETED);
    // E a reversao registra o caminho de volta.
    expect(trilha[1].reason).toContain('Revertido');
    expect(trilha[1].statusBefore).toBe(SessionStatus.COMPLETED);
    expect(trilha[1].statusAfter).toBe(SessionStatus.SHORT);
  });

  it('AUTO_CLOSED nao vira COMPLETED de 4h na volta', async () => {
    // O detalhe sutil: em AUTO_CLOSED as 6h gravadas sao o TETO do
    // auto-encerramento, nao uma medida. Passar 360 min por `classificar` daria
    // COMPLETED com 240 -- a reversao criaria um treino contavel que nunca
    // existiu, no lugar de restaurar o que havia.
    const u = await novoUsuario();
    const s = await sessaoEsticada({
      userId: u.id,
      inicio: new Date(Date.UTC(2026, 7, 26, 6, 0)),
      minutosOriginais: 360,
      statusOriginal: SessionStatus.AUTO_CLOSED,
      minutosDepois: 200,
    });

    const r = await reverterCorrecao(prisma, s.id, { aplicar: true });

    expect(r.depois.status).toBe(SessionStatus.AUTO_CLOSED);
    expect(r.depois.durationMin).toBe(360);

    const depois = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(depois.status).toBe(SessionStatus.AUTO_CLOSED);
    expect(depois.durationMin).toBe(360);
  });

  it('recalcula o dia a partir do inicio original, no fuso do usuario', async () => {
    const u = await novoUsuario('America/Sao_Paulo');
    // 02:00 UTC = 23:00 do dia ANTERIOR em Sao Paulo (UTC-3).
    const inicio = new Date(Date.UTC(2026, 7, 27, 2, 0));
    const s = await sessaoEsticada({
      userId: u.id,
      inicio,
      minutosOriginais: 30,
      statusOriginal: SessionStatus.COMPLETED,
      minutosDepois: 240,
    });

    const r = await reverterCorrecao(prisma, s.id, { aplicar: true });

    expect(r.depois.dayKey).toBe('2026-08-26');
  });

  it('reverte para a PRIMEIRA correcao quando houve varias', async () => {
    const u = await novoUsuario();
    const inicio = new Date(Date.UTC(2026, 7, 26, 12, 0));
    const s = await sessaoEsticada({
      userId: u.id,
      inicio,
      minutosOriginais: 2,
      statusOriginal: SessionStatus.SHORT,
      minutosDepois: 100,
    });
    // Segunda correcao: parte de um valor JA corrigido, entao nao serve de
    // referencia pro original.
    await prisma.sessionCorrection.create({
      data: {
        sessionId: s.id,
        authorId: u.id,
        reason: 'mais um ajuste',
        startedAtBefore: inicio,
        startedAtAfter: inicio,
        endedAtBefore: new Date(inicio.getTime() + 100 * 60000),
        endedAtAfter: new Date(inicio.getTime() + 200 * 60000),
        statusBefore: SessionStatus.COMPLETED,
        statusAfter: SessionStatus.COMPLETED,
      },
    });

    const r = await reverterCorrecao(prisma, s.id, { aplicar: true });

    expect(r.correcoesDesfeitas).toBe(2);
    expect(r.depois.durationMin).toBe(2);
    expect(r.depois.status).toBe(SessionStatus.SHORT);
  });

  it('recusa sessao que nunca foi corrigida', async () => {
    const u = await novoUsuario();
    const s = await prisma.workoutSession.create({
      data: {
        userId: u.id,
        startedAt: new Date(Date.UTC(2026, 7, 26, 12, 0)),
        endedAt: new Date(Date.UTC(2026, 7, 26, 13, 0)),
        durationMin: 60,
        status: SessionStatus.COMPLETED,
        dayKey: '2026-08-26',
      },
    });

    await expect(reverterCorrecao(prisma, s.id, { aplicar: true })).rejects.toThrow(
      /nunca foi corrigida/,
    );
  });

  it('recusa sessao inexistente', async () => {
    await expect(
      reverterCorrecao(prisma, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/nao encontrada/);
  });

  it('para quando a auditoria nao guardou o horario anterior', async () => {
    // Nao deveria acontecer, mas adivinhar um horario seria pior do que parar.
    const u = await novoUsuario();
    const s = await prisma.workoutSession.create({
      data: {
        userId: u.id,
        startedAt: new Date(Date.UTC(2026, 7, 26, 12, 0)),
        endedAt: new Date(Date.UTC(2026, 7, 26, 16, 0)),
        durationMin: 240,
        status: SessionStatus.COMPLETED,
        dayKey: '2026-08-26',
      },
    });
    await prisma.sessionCorrection.create({
      data: { sessionId: s.id, authorId: u.id, reason: 'trilha incompleta' },
    });

    await expect(reverterCorrecao(prisma, s.id, { aplicar: true })).rejects.toThrow(
      /nao da pra reverter com seguranca/,
    );
  });

  it('lista as sessoes corrigidas com o valor atual e o original', async () => {
    const u = await novoUsuario();
    const s = await sessaoEsticada({
      userId: u.id,
      inicio: new Date(Date.UTC(2026, 7, 26, 12, 0)),
      minutosOriginais: 1,
      statusOriginal: SessionStatus.SHORT,
      minutosDepois: 240,
    });

    const lista = await listarSessoesCorrigidas(prisma);
    const minha = lista.find((x) => x.sessionId === s.id);

    expect(minha).toBeDefined();
    expect(minha!.atual.durationMin).toBe(240);
    expect(minha!.original.status).toBe(SessionStatus.SHORT);
    expect(minha!.correcoes).toBe(1);
  });
});
