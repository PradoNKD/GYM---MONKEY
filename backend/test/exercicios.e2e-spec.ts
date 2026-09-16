import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExerciciosService } from '../src/exercicios/exercicios.service';

describe('ExerciciosService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let exercicios: ExerciciosService;
  const criados: string[] = [];

  async function novoUsuario() {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `ex-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
      },
    });
    criados.push(u.id);
    return u;
  }

  async function sessao(
    userId: string,
    dia: string,
    status: SessionStatus = SessionStatus.COMPLETED,
  ) {
    const inicio = new Date(`${dia}T15:00:00Z`);
    return prisma.workoutSession.create({
      data: {
        userId,
        startedAt: inicio,
        endedAt: new Date(inicio.getTime() + 60 * 60000),
        durationMin: 60,
        status,
        dayKey: dia,
      },
    });
  }

  const s = (reps: number, pesoG: number | null) => ({ reps, pesoG });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    exercicios = app.get(ExerciciosService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  describe('o catalogo se constroi sozinho', () => {
    it('o primeiro nome digitado vira exercicio', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, t.id, 'Supino reto', [s(10, 40000)]);

      const { exercicios: lista } = await exercicios.sugestoes(u.id);
      expect(lista).toHaveLength(1);
      expect(lista[0].nome).toBe('Supino reto');
    });

    // O coracao da Fase B: se isto falhar, o grafico se parte em varias linhas
    // com o mesmo nome e o dado fica inutil.
    it('caixa e acento diferentes NAO criam exercicio novo', async () => {
      const u = await novoUsuario();
      const a = await sessao(u.id, '2026-09-10');
      const b = await sessao(u.id, '2026-09-11');
      const c = await sessao(u.id, '2026-09-12');

      await exercicios.salvarSeries(u.id, a.id, 'Tríceps testa', [s(10, 20000)]);
      await exercicios.salvarSeries(u.id, b.id, 'TRICEPS TESTA', [s(10, 20000)]);
      await exercicios.salvarSeries(u.id, c.id, '  triceps   testa ', [s(10, 20000)]);

      const { exercicios: lista } = await exercicios.sugestoes(u.id);
      expect(lista).toHaveLength(1);
      // Guarda o nome como foi escrito da PRIMEIRA vez.
      expect(lista[0].nome).toBe('Tríceps testa');
      expect(lista[0].series).toBe(3);
    });

    it('nomes de verdade diferentes viram exercicios diferentes', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, t.id, 'Supino reto', [s(10, 40000)]);
      await exercicios.salvarSeries(u.id, t.id, 'Supino inclinado', [s(10, 30000)]);

      const { exercicios: lista } = await exercicios.sugestoes(u.id);
      expect(lista).toHaveLength(2);
    });

    it('o catalogo de um nao aparece para o outro', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      const t = await sessao(a.id, '2026-09-10');

      await exercicios.salvarSeries(a.id, t.id, 'Levantamento terra', [s(5, 80000)]);

      expect((await exercicios.sugestoes(b.id)).exercicios).toEqual([]);
    });

    it('sugestoes vem com os mais usados primeiro', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, t.id, 'Agachamento', [s(10, 60000), s(10, 60000)]);
      await exercicios.salvarSeries(u.id, t.id, 'Panturrilha', [s(15, 30000)]);

      const { exercicios: lista } = await exercicios.sugestoes(u.id);
      expect(lista.map((e) => e.nome)).toEqual(['Agachamento', 'Panturrilha']);
    });
  });

  describe('salvar series', () => {
    // PUT idempotente: com sinal ruim na academia, repetir nao pode duplicar.
    it('salvar duas vezes substitui, nao acumula', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, t.id, 'Remada', [s(10, 40000), s(10, 40000)]);
      const r = await exercicios.salvarSeries(u.id, t.id, 'Remada', [s(10, 40000)]);

      expect(r.exercicios[0].series).toHaveLength(1);
    });

    it('mandar lista vazia apaga o exercicio do treino', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, t.id, 'Remada', [s(10, 40000)]);
      const r = await exercicios.salvarSeries(u.id, t.id, 'Remada', []);

      expect(r.exercicios).toEqual([]);
    });

    it('peso do corpo e null, e sobrevive a ida e volta', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      const r = await exercicios.salvarSeries(u.id, t.id, 'Barra fixa', [s(8, null)]);

      expect(r.exercicios[0].series[0].pesoG).toBeNull();
    });

    // Editar e livre: nao existe trava de correcao aqui, de proposito.
    it('editar serie nao gasta correcao de sessao', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      for (let i = 0; i < 5; i++) {
        await exercicios.salvarSeries(u.id, t.id, 'Rosca', [s(10, 10000 + i * 1000)]);
      }

      const correcoes = await prisma.sessionCorrection.count({ where: { sessionId: t.id } });
      expect(correcoes).toBe(0);
    });

    it('funciona com o treino ainda ABERTO', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10', SessionStatus.OPEN);

      const r = await exercicios.salvarSeries(u.id, t.id, 'Supino', [s(10, 40000)]);

      expect(r.exercicios).toHaveLength(1);
    });

    it('nao escreve no treino de outra pessoa', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      const t = await sessao(a.id, '2026-09-10');

      await expect(
        exercicios.salvarSeries(b.id, t.id, 'Supino', [s(10, 40000)]),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['reps zero', [{ reps: 0, pesoG: 40000 }]],
      ['reps demais', [{ reps: 9999, pesoG: 40000 }]],
      ['carga absurda', [{ reps: 10, pesoG: 99_000_000 }]],
      ['carga negativa', [{ reps: 10, pesoG: -1 }]],
    ])('recusa %s', async (_, series) => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await expect(exercicios.salvarSeries(u.id, t.id, 'Supino', series)).rejects.toThrow();
    });

    it('recusa exercicio sem nome', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');

      await expect(exercicios.salvarSeries(u.id, t.id, '   ', [s(10, 40000)])).rejects.toThrow();
    });
  });

  describe('progressao', () => {
    it('um ponto por dia, com carga maxima e volume', async () => {
      const u = await novoUsuario();
      const a = await sessao(u.id, '2026-09-03');
      const b = await sessao(u.id, '2026-09-10');

      await exercicios.salvarSeries(u.id, a.id, 'Supino', [s(10, 37500), s(10, 37500)]);
      await exercicios.salvarSeries(u.id, b.id, 'Supino', [s(10, 40000), s(8, 42500)]);

      const { id } = (await exercicios.sugestoes(u.id)).exercicios[0];
      const r = await exercicios.progressaoDe(u.id, id);

      expect(r.pontos).toEqual([
        { dia: '2026-09-03', cargaMaxG: 37500, volumeG: 750_000, series: 2 },
        { dia: '2026-09-10', cargaMaxG: 42500, volumeG: 740_000, series: 2 },
      ]);
      expect(r.recorde).toEqual({ dia: '2026-09-10', pesoG: 42500 });
    });

    // Treino descartado por curto demais nao pode empurrar linha no grafico.
    it('so conta treino contavel', async () => {
      const u = await novoUsuario();
      const bom = await sessao(u.id, '2026-09-03');
      // SHORT = fechada abaixo da duracao minima. `ehContabil` so aceita
      // COMPLETED, e o grafico segue a mesma regra.
      const curto = await sessao(u.id, '2026-09-10', SessionStatus.SHORT);

      await exercicios.salvarSeries(u.id, bom.id, 'Supino', [s(10, 40000)]);
      await exercicios.salvarSeries(u.id, curto.id, 'Supino', [s(10, 99000)]);

      const { id } = (await exercicios.sugestoes(u.id)).exercicios[0];
      const r = await exercicios.progressaoDe(u.id, id);

      expect(r.pontos).toHaveLength(1);
      expect(r.recorde?.pesoG).toBe(40000);
    });

    it('nao devolve progressao de exercicio de outra pessoa', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      const t = await sessao(a.id, '2026-09-10');
      await exercicios.salvarSeries(a.id, t.id, 'Supino', [s(10, 40000)]);
      const { id } = (await exercicios.sugestoes(a.id)).exercicios[0];

      await expect(exercicios.progressaoDe(b.id, id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('ultima vez (a base do repetir)', () => {
    it('devolve as series do treino anterior', async () => {
      const u = await novoUsuario();
      const antes = await sessao(u.id, '2026-09-03');
      await exercicios.salvarSeries(u.id, antes.id, 'Supino', [s(10, 40000), s(8, 42500)]);

      const { id } = (await exercicios.sugestoes(u.id)).exercicios[0];
      const r = await exercicios.ultimaVez(u.id, id);

      expect(r.dia).toBe('2026-09-03');
      expect(r.series).toEqual([s(10, 40000), s(8, 42500)]);
    });

    // Sem isso, assim que a primeira serie de hoje fosse salva a sugestao
    // viraria um espelho do que acabou de ser digitado.
    it('ignora o treino em andamento quando pedido', async () => {
      const u = await novoUsuario();
      const antes = await sessao(u.id, '2026-09-03');
      const hoje = await sessao(u.id, '2026-09-10', SessionStatus.OPEN);

      await exercicios.salvarSeries(u.id, antes.id, 'Supino', [s(10, 40000)]);
      await exercicios.salvarSeries(u.id, hoje.id, 'Supino', [s(10, 50000)]);

      const { id } = (await exercicios.sugestoes(u.id)).exercicios[0];
      const r = await exercicios.ultimaVez(u.id, id, hoje.id);

      expect(r.dia).toBe('2026-09-03');
      expect(r.series).toEqual([s(10, 40000)]);
    });

    it('exercicio estreando nao tem ultima vez', async () => {
      const u = await novoUsuario();
      const t = await sessao(u.id, '2026-09-10');
      await exercicios.salvarSeries(u.id, t.id, 'Supino', [s(10, 40000)]);
      const { id } = (await exercicios.sugestoes(u.id)).exercicios[0];

      const r = await exercicios.ultimaVez(u.id, id, t.id);

      expect(r).toEqual({ dia: null, series: [] });
    });
  });

  it('remover exercicio tira so ele do treino', async () => {
    const u = await novoUsuario();
    const t = await sessao(u.id, '2026-09-10');
    await exercicios.salvarSeries(u.id, t.id, 'Supino', [s(10, 40000)]);
    await exercicios.salvarSeries(u.id, t.id, 'Remada', [s(10, 30000)]);
    const supino = (await exercicios.sugestoes(u.id)).exercicios.find((e) => e.nome === 'Supino')!;

    const r = await exercicios.removerExercicio(u.id, t.id, supino.id);

    expect(r.exercicios.map((e) => e.nome)).toEqual(['Remada']);
    // O exercicio continua no catalogo -- tirar do treino nao e esquecer o nome.
    expect((await exercicios.sugestoes(u.id)).exercicios).toHaveLength(2);
  });
});
