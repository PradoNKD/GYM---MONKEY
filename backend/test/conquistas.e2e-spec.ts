import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionStatus, WeekStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConquistasService } from '../src/sessions/conquistas.service';

describe('ConquistasService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conquistas: ConquistasService;
  const criados: string[] = [];

  async function novoUsuario() {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `conq-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
      },
    });
    criados.push(u.id);
    return u;
  }

  async function treinouEm(userId: string, ...dias: string[]) {
    for (const dia of dias) {
      const inicio = new Date(`${dia}T15:00:00Z`);
      await prisma.workoutSession.create({
        data: {
          userId,
          startedAt: inicio,
          endedAt: new Date(inicio.getTime() + 60 * 60000),
          durationMin: 60,
          status: SessionStatus.COMPLETED,
          dayKey: dia,
        },
      });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    conquistas = app.get(ConquistasService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  const codigos = (lista: { code: string }[]) => lista.map((c) => c.code);

  it('quem nao treinou nao conquistou nada', async () => {
    const u = await novoUsuario();

    const r = await conquistas.avaliar(u.id);

    expect(r.novas).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.proximo?.code).toBe('PRIMEIRO_TREINO');
  });

  it('o primeiro treino vira marco, com descricao pronta para a tela', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24');

    const r = await conquistas.avaliar(u.id);

    expect(codigos(r.novas)).toContain('PRIMEIRO_TREINO');
    expect(r.novas[0].nome).toBe('Primeiro treino');
  });

  // Sem isto a tela faria a mesma festa em toda visita.
  it('a festa acontece uma vez so', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24');

    const antes = await conquistas.avaliar(u.id);
    expect(antes.novas.length).toBeGreaterThan(0);

    await conquistas.marcarVistas(u.id);
    const depois = await conquistas.avaliar(u.id);

    expect(depois.novas).toEqual([]);
    // Mas a conquista continua existindo.
    expect(depois.total).toBeGreaterThan(0);
  });

  it('avaliar duas vezes nao duplica linha', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24', '2026-08-25');

    await conquistas.avaliar(u.id);
    await conquistas.avaliar(u.id);

    const linhas = await prisma.achievement.findMany({
      where: { userId: u.id, code: 'PRIMEIRO_TREINO' },
    });
    expect(linhas).toHaveLength(1);
  });

  it('duas avaliacoes simultaneas nao duplicam nem quebram', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24');

    await Promise.all([conquistas.avaliar(u.id), conquistas.avaliar(u.id)]);

    const linhas = await prisma.achievement.findMany({
      where: { userId: u.id, code: 'PRIMEIRO_TREINO' },
    });
    expect(linhas).toHaveLength(1);
  });

  describe('recordes', () => {
    // Comemorar "1 dia seguido" no primeiro treino seria barulho em cima do
    // marco PRIMEIRO_TREINO, que ja esta comemorando a mesma coisa.
    it('a primeira marca nao vira festa', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24');

      const r = await conquistas.avaliar(u.id);

      expect(codigos(r.novas)).not.toContain('RECORDE_DIAS');
      const gravado = await prisma.achievement.findFirst({
        where: { userId: u.id, code: 'RECORDE_DIAS' },
      });
      expect(gravado?.value).toBe(1);
      expect(gravado?.seenAt).not.toBeNull();
    });

    it('superar a marca antiga vira festa', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24');
      await conquistas.avaliar(u.id);
      await conquistas.marcarVistas(u.id);

      // Dois dias seguidos: o recorde de dias sobe de 1 para 2.
      await treinouEm(u.id, '2026-08-25');
      const r = await conquistas.avaliar(u.id);

      expect(codigos(r.novas)).toContain('RECORDE_DIAS');
      const gravado = await prisma.achievement.findFirst({
        where: { userId: u.id, code: 'RECORDE_DIAS' },
      });
      expect(gravado?.value).toBe(2);
    });

    it('nao comemora de novo sem a marca ter caido', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-25');
      await conquistas.avaliar(u.id);
      await conquistas.marcarVistas(u.id);

      // Treino solto: nao supera a sequencia de 2.
      await treinouEm(u.id, '2026-08-28');
      const r = await conquistas.avaliar(u.id);

      expect(codigos(r.novas)).not.toContain('RECORDE_DIAS');
    });
  });

  it('marco de semanas usa as semanas ja fechadas', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24');
    await prisma.weeklyResult.createMany({
      data: [1, 2, 3, 4].map((n) => ({
        userId: u.id,
        semanaInicio: `2026-0${n < 4 ? 7 : 8}-0${n}`,
        semanaFim: `2026-0${n < 4 ? 7 : 8}-0${n}`,
        meta: 3,
        treinos: 3,
        status: WeekStatus.CUMPRIDA,
        streakAntes: n - 1,
        streakDepois: n,
        tokensDepois: 2,
        cumpridasSeguidas: n,
      })),
    });

    const r = await conquistas.avaliar(u.id);

    expect(codigos(r.novas)).toContain('PRIMEIRA_SEMANA');
    expect(codigos(r.novas)).toContain('PRIMEIRO_MES');
    expect(codigos(r.novas)).toContain('SEMANAS_4');
  });

  it('nao vaza conquista de outra pessoa', async () => {
    const a = await novoUsuario();
    const b = await novoUsuario();
    await treinouEm(a.id, '2026-08-24');
    await conquistas.avaliar(a.id);

    const r = await conquistas.avaliar(b.id);

    expect(r.novas).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('listar devolve o catalogo inteiro, com o que falta', async () => {
    const u = await novoUsuario();
    await treinouEm(u.id, '2026-08-24');

    const lista = await conquistas.listar(u.id);

    expect(lista.marcos.length).toBeGreaterThanOrEqual(15);
    expect(lista.marcos.find((m) => m.code === 'PRIMEIRO_TREINO')?.conquistado).toBe(true);
    expect(lista.marcos.find((m) => m.code === 'DIAS_200')?.conquistado).toBe(false);
    expect(lista.recordes.find((r) => r.code === 'RECORDE_DIAS')?.valor).toBe(1);
  });
});
