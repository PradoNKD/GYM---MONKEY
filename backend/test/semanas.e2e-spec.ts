import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionStatus, WeekStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SemanasService } from '../src/sessions/semanas.service';

// O fechamento semanal e preguicoso: ele acontece na leitura, nao num cron.
// Estes testes existem para provar que "na leitura" produz exatamente o mesmo
// resultado que um job da meia-noite produziria -- inclusive quando a leitura
// so acontece semanas depois.
class SemanasComRelogio extends SemanasService {
  instante = new Date('2026-08-31T12:00:00Z'); // segunda

  protected agora(): Date {
    return this.instante;
  }

  em(iso: string) {
    this.instante = new Date(iso);
  }
}

describe('SemanasService - meta semanal e streak de semanas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let semanas: SemanasComRelogio;
  const criados: string[] = [];

  async function novoUsuario(timezone = 'America/Sao_Paulo') {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `semana-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
        timezone,
      },
    });
    criados.push(u.id);
    return u;
  }

  /** Cria treinos contaveis nos dias informados (YYYY-MM-DD). */
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
  });

  beforeEach(() => {
    semanas = new SemanasComRelogio(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  describe('fechamento preguicoso', () => {
    it('fecha a semana que acabou, na primeira leitura depois dela', async () => {
      const u = await novoUsuario();
      // Semana de 24/08 (seg) a 30/08 (dom): tres treinos, meta padrao 3.
      await treinouEm(u.id, '2026-08-24', '2026-08-26', '2026-08-28');

      semanas.em('2026-08-31T12:00:00Z'); // segunda seguinte
      const resumo = await semanas.resumo(u.id);

      expect(resumo.streakSemanas).toBe(1);

      const linhas = await prisma.weeklyResult.findMany({ where: { userId: u.id } });
      expect(linhas).toHaveLength(1);
      expect(linhas[0].semanaInicio).toBe('2026-08-24');
      expect(linhas[0].semanaFim).toBe('2026-08-30');
      expect(linhas[0].status).toBe(WeekStatus.CUMPRIDA);
      expect(linhas[0].treinos).toBe(3);
    });

    it('NAO fecha a semana corrente: ela ainda esta sendo vivida', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26', '2026-08-28');

      semanas.em('2026-08-28T12:00:00Z'); // sexta da propria semana
      const resumo = await semanas.resumo(u.id);

      expect(await prisma.weeklyResult.count({ where: { userId: u.id } })).toBe(0);
      // A semana ja esta cumprida, mas a streak so avanca quando ela fechar.
      expect(resumo.cumprida).toBe(true);
      expect(resumo.treinos).toBe(3);
      expect(resumo.streakSemanas).toBe(0);
    });

    it('e idempotente: ler de novo nao fecha a mesma semana duas vezes', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26', '2026-08-28');
      semanas.em('2026-08-31T12:00:00Z');

      const primeira = await semanas.resumo(u.id);
      const segunda = await semanas.resumo(u.id);
      const terceira = await semanas.resumo(u.id);

      expect(segunda).toEqual(primeira);
      expect(terceira).toEqual(primeira);
      expect(await prisma.weeklyResult.count({ where: { userId: u.id } })).toBe(1);
    });

    it('duas leituras simultaneas nao duplicam nem divergem', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26', '2026-08-28');
      semanas.em('2026-08-31T12:00:00Z');

      const [a, b] = await Promise.all([semanas.resumo(u.id), semanas.resumo(u.id)]);

      expect(await prisma.weeklyResult.count({ where: { userId: u.id } })).toBe(1);
      expect(a.streakSemanas).toBe(1);
      expect(b.streakSemanas).toBe(1);
    });

    it('quem ficou semanas sem abrir o app tem todas fechadas de uma vez', async () => {
      const u = await novoUsuario();
      // Cumpre 03/08 e 10/08; some em 17/08 e 24/08.
      await treinouEm(u.id, '2026-08-03', '2026-08-05', '2026-08-07');
      await treinouEm(u.id, '2026-08-10', '2026-08-12', '2026-08-14');

      semanas.em('2026-08-31T12:00:00Z'); // volta so agora
      const resumo = await semanas.resumo(u.id);

      const linhas = await prisma.weeklyResult.findMany({
        where: { userId: u.id },
        orderBy: { semanaInicio: 'asc' },
      });
      expect(linhas.map((l) => l.semanaInicio)).toEqual([
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
      ]);
      expect(linhas.map((l) => l.status)).toEqual([
        WeekStatus.CUMPRIDA,
        WeekStatus.CUMPRIDA,
        WeekStatus.CONGELADA, // os dois congelamentos iniciais seguram
        WeekStatus.CONGELADA,
      ]);
      // Congelada nao avanca e nao zera: continua valendo as duas cumpridas.
      expect(resumo.streakSemanas).toBe(2);
      expect(resumo.tokens).toBe(0);
    });

    it('quem nunca treinou nao acumula semanas perdidas', async () => {
      const u = await novoUsuario();

      semanas.em('2026-08-31T12:00:00Z');
      const resumo = await semanas.resumo(u.id);

      expect(await prisma.weeklyResult.count({ where: { userId: u.id } })).toBe(0);
      expect(resumo.streakSemanas).toBe(0);
      expect(resumo.tokens).toBe(2);
      expect(resumo.recomeco).toBe(false);
    });

    it('conta DIAS distintos, nao sessoes: treinar 3x num dia so nao cumpre a meta', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-24', '2026-08-24');

      semanas.em('2026-08-31T12:00:00Z');
      const resumo = await semanas.resumo(u.id);

      const linha = await prisma.weeklyResult.findFirst({ where: { userId: u.id } });
      expect(linha?.treinos).toBe(1);
      expect(linha?.status).toBe(WeekStatus.PERDIDA);
      expect(resumo.streakSemanas).toBe(0);
    });

    it('sessao nao contavel nao alimenta a meta', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26');
      // Terceiro "treino" curto demais: entra no historico, fora da conta.
      await prisma.workoutSession.create({
        data: {
          userId: u.id,
          startedAt: new Date('2026-08-28T15:00:00Z'),
          endedAt: new Date('2026-08-28T15:03:00Z'),
          durationMin: 3,
          status: SessionStatus.SHORT,
          dayKey: '2026-08-28',
        },
      });

      semanas.em('2026-08-31T12:00:00Z');
      await semanas.resumo(u.id);

      const linha = await prisma.weeklyResult.findFirst({ where: { userId: u.id } });
      expect(linha?.treinos).toBe(2);
      expect(linha?.status).toBe(WeekStatus.PERDIDA);
    });
  });

  describe('fuso do usuario', () => {
    it('o treino de domingo a noite fica na semana certa', async () => {
      // 2026-08-31T01:00Z = domingo 30/08, 22h em Sao Paulo.
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26');
      await prisma.workoutSession.create({
        data: {
          userId: u.id,
          startedAt: new Date('2026-08-31T01:00:00Z'),
          endedAt: new Date('2026-08-31T02:00:00Z'),
          durationMin: 60,
          status: SessionStatus.COMPLETED,
          // dayKey e gravado no fuso do usuario: ainda e domingo, dia 30.
          dayKey: '2026-08-30',
        },
      });

      semanas.em('2026-08-31T12:00:00Z');
      await semanas.resumo(u.id);
      const linha = await prisma.weeklyResult.findFirst({ where: { userId: u.id } });

      expect(linha?.treinos).toBe(3);
      expect(linha?.status).toBe(WeekStatus.CUMPRIDA);
    });
  });

  describe('meta', () => {
    it('a troca so vale a partir da semana seguinte', async () => {
      const u = await novoUsuario();
      semanas.em('2026-08-26T12:00:00Z'); // quarta

      const salvo = await semanas.alterarMeta(u.id, 5);

      expect(salvo.meta).toBe(3); // a meta em vigor nao mudou
      expect(salvo.metaAgendada).toEqual({ meta: 5, validaDe: '2026-08-31' });

      const resumo = await semanas.resumo(u.id);
      expect(resumo.meta).toBe(3);
      expect(resumo.metaAgendada).toEqual({ meta: 5, validaDe: '2026-08-31' });
    });

    // O golpe que a regra existe para impedir: baixar a meta no domingo a noite
    // depois de ver quantos treinos deu.
    it('baixar a meta no domingo NAO salva a semana corrente', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-24', '2026-08-26'); // so 2, meta 5
      await prisma.weeklyGoal.create({ data: { userId: u.id, meta: 5 } });

      semanas.em('2026-08-30T23:00:00Z'); // domingo, ultima hora
      await semanas.alterarMeta(u.id, 3);

      semanas.em('2026-08-31T12:00:00Z'); // segunda: fecha a semana
      await semanas.resumo(u.id);

      const linha = await prisma.weeklyResult.findFirst({ where: { userId: u.id } });
      // Julgada pela meta 5, que era a que valia durante a semana.
      expect(linha?.meta).toBe(5);
      expect(linha?.status).toBe(WeekStatus.PERDIDA);
    });

    it('a meta agendada entra em vigor quando a semana dela chega', async () => {
      const u = await novoUsuario();
      semanas.em('2026-08-26T12:00:00Z');
      await semanas.alterarMeta(u.id, 4);

      semanas.em('2026-08-31T12:00:00Z'); // semana seguinte
      const resumo = await semanas.resumo(u.id);

      expect(resumo.meta).toBe(4);
      expect(resumo.metaAgendada).toBeNull();
    });

    it('voltar para a meta atual cancela o agendamento', async () => {
      const u = await novoUsuario();
      semanas.em('2026-08-26T12:00:00Z');
      await semanas.alterarMeta(u.id, 6);
      const cancelado = await semanas.alterarMeta(u.id, 3);

      expect(cancelado.meta).toBe(3);
      expect(cancelado.metaAgendada).toBeNull();
    });

    it('recusa meta fora da faixa', async () => {
      const u = await novoUsuario();

      await expect(semanas.alterarMeta(u.id, 2)).rejects.toThrow(BadRequestException);
      await expect(semanas.alterarMeta(u.id, 7)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reparo', () => {
    it('meta + 1 depois de perder devolve a sequencia', async () => {
      const u = await novoUsuario();
      // Tres semanas cumpridas...
      await treinouEm(u.id, '2026-07-06', '2026-07-08', '2026-07-10');
      await treinouEm(u.id, '2026-07-13', '2026-07-15', '2026-07-17');
      await treinouEm(u.id, '2026-07-20', '2026-07-22', '2026-07-24');
      // ...uma perdida (sem congelamento porque ainda nao gastou nenhum? nao:
      // os dois iniciais seguram, entao gastamos os dois antes).
      semanas.em('2026-07-27T12:00:00Z');
      await semanas.resumo(u.id);

      // Duas semanas vazias queimam os dois congelamentos.
      semanas.em('2026-08-10T12:00:00Z');
      const antes = await semanas.resumo(u.id);
      expect(antes.tokens).toBe(0);
      expect(antes.streakSemanas).toBe(3);

      // Terceira semana vazia: agora perde de verdade.
      semanas.em('2026-08-17T12:00:00Z');
      const perdeu = await semanas.resumo(u.id);
      expect(perdeu.streakSemanas).toBe(0);
      expect(perdeu.reparo).toEqual({ streakSalva: 3, exige: 4 });

      // Semana do reparo: meta + 1 = 4 dias.
      await treinouEm(u.id, '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20');
      semanas.em('2026-08-24T12:00:00Z');
      const reparado = await semanas.resumo(u.id);

      expect(reparado.streakSemanas).toBe(4); // 3 salvos + a semana do reparo
      expect(reparado.reparo).toBeNull();
    });
  });

  describe('recomeco', () => {
    it('quatro semanas vazias ativam o modo recomeco', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-07-06', '2026-07-08', '2026-07-10');

      // 13/07, 20/07, 27/07 e 03/08 vazias.
      semanas.em('2026-08-10T12:00:00Z');
      const resumo = await semanas.resumo(u.id);

      expect(resumo.streakSemanas).toBe(0);
      expect(resumo.recomeco).toBe(true);
    });

    it('treinar na semana corrente ja tira o modo recomeco', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-07-06', '2026-07-08', '2026-07-10');
      await treinouEm(u.id, '2026-08-10'); // voltou

      semanas.em('2026-08-10T18:00:00Z');
      const resumo = await semanas.resumo(u.id);

      expect(resumo.recomeco).toBe(false);
      expect(resumo.treinos).toBe(1);
    });
  });

  describe('historico', () => {
    it('devolve as semanas fechadas, da mais recente para a mais antiga', async () => {
      const u = await novoUsuario();
      await treinouEm(u.id, '2026-08-03', '2026-08-05', '2026-08-07');
      await treinouEm(u.id, '2026-08-10', '2026-08-12', '2026-08-14');

      semanas.em('2026-08-17T12:00:00Z');
      const historico = await semanas.historico(u.id);

      expect(historico.map((s) => s.semanaInicio)).toEqual(['2026-08-10', '2026-08-03']);
      expect(historico[0].streakDepois).toBe(2);
    });
  });
});
