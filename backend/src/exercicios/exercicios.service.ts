import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  limparNome,
  normalizar,
  PESO_MAX_G,
  progressao,
  recorde,
  REPS_MAX,
  REPS_MIN,
  SERIES_MAX_POR_EXERCICIO,
} from './exercicios';

export type SerieEntrada = { reps: number; pesoG: number | null };

@Injectable()
export class ExerciciosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Acha ou cria o exercicio pelo nome. E aqui que o catalogo se constroi.
   *
   * A unicidade e do banco (`@@unique([userId, slug])`), nao desta funcao:
   * duas telas salvando o mesmo nome ao mesmo tempo resolvem no P2002, e a
   * perdedora so le a linha que a vencedora criou.
   */
  private async acharOuCriar(userId: string, nome: string) {
    const limpo = limparNome(nome);
    if (!limpo) throw new BadRequestException('O exercicio precisa de um nome');

    const slug = normalizar(limpo);

    const existente = await this.prisma.exercise.findUnique({
      where: { userId_slug: { userId, slug } },
    });
    if (existente) return existente;

    try {
      return await this.prisma.exercise.create({ data: { userId, name: limpo, slug } });
    } catch (erro) {
      if ((erro as { code?: string })?.code !== 'P2002') throw erro;

      return this.prisma.exercise.findUniqueOrThrow({
        where: { userId_slug: { userId, slug } },
      });
    }
  }

  /** A sessao tem de ser da pessoa. Sem isso, qualquer id escreveria em qualquer treino. */
  private async sessaoDoUsuario(userId: string, sessionId: string) {
    const sessao = await this.prisma.workoutSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, status: true },
    });
    if (!sessao) throw new NotFoundException('Treino nao encontrado');

    return sessao;
  }

  private validar(series: SerieEntrada[]) {
    if (series.length > SERIES_MAX_POR_EXERCICIO) {
      throw new BadRequestException(
        `No maximo ${SERIES_MAX_POR_EXERCICIO} series por exercicio`,
      );
    }

    for (const s of series) {
      if (!Number.isInteger(s.reps) || s.reps < REPS_MIN || s.reps > REPS_MAX) {
        throw new BadRequestException(
          `Repeticoes devem ser um numero inteiro de ${REPS_MIN} a ${REPS_MAX}`,
        );
      }
      if (s.pesoG === null) continue;
      if (!Number.isInteger(s.pesoG) || s.pesoG < 0 || s.pesoG > PESO_MAX_G) {
        throw new BadRequestException('Carga invalida');
      }
    }
  }

  /**
   * Substitui as series de UM exercicio numa sessao.
   *
   * Substituir, e nao acrescentar, porque a tela edita a lista inteira: mandar
   * o estado final e o que torna "apaguei a 3a serie" possivel sem uma rota de
   * remover serie por serie.
   *
   * **Fora da trava de correcao, de proposito.** A trava (uma por sessao, teto
   * de +1h) existe porque horario decide o que conta -- streak, meta, dayKey.
   * Serie e carga nao decidem nada disso: sao anotacao. Gastar a unica correcao
   * da sessao para consertar um "40" digitado como "4" puniria exatamente o
   * habito que esta fase quer criar. Editar e livre e ilimitado.
   */
  async salvarSeries(
    userId: string,
    sessionId: string,
    nomeDoExercicio: string,
    series: SerieEntrada[],
  ) {
    await this.sessaoDoUsuario(userId, sessionId);
    this.validar(series);

    const exercicio = await this.acharOuCriar(userId, nomeDoExercicio);

    await this.prisma.$transaction([
      this.prisma.exerciseSet.deleteMany({
        where: { sessionId, exerciseId: exercicio.id },
      }),
      this.prisma.exerciseSet.createMany({
        data: series.map((s, i) => ({
          sessionId,
          exerciseId: exercicio.id,
          position: i + 1,
          reps: s.reps,
          weightG: s.pesoG,
        })),
      }),
    ]);

    return this.doTreino(userId, sessionId);
  }

  /** Remove um exercicio inteiro do treino. */
  async removerExercicio(userId: string, sessionId: string, exerciseId: string) {
    await this.sessaoDoUsuario(userId, sessionId);

    await this.prisma.exerciseSet.deleteMany({
      where: { sessionId, exerciseId, exercise: { userId } },
    });

    return this.doTreino(userId, sessionId);
  }

  /** O que foi feito num treino, agrupado por exercicio e em ordem. */
  async doTreino(userId: string, sessionId: string) {
    await this.sessaoDoUsuario(userId, sessionId);

    const series = await this.prisma.exerciseSet.findMany({
      where: { sessionId, exercise: { userId } },
      orderBy: [{ exerciseId: 'asc' }, { position: 'asc' }],
      include: { exercise: { select: { id: true, name: true } } },
    });

    const porExercicio = new Map<
      string,
      { id: string; nome: string; series: { reps: number; pesoG: number | null }[] }
    >();

    for (const s of series) {
      const atual = porExercicio.get(s.exerciseId) ?? {
        id: s.exercise.id,
        nome: s.exercise.name,
        series: [],
      };
      atual.series.push({ reps: s.reps, pesoG: s.weightG });
      porExercicio.set(s.exerciseId, atual);
    }

    return { exercicios: [...porExercicio.values()] };
  }

  /**
   * As sugestoes do autocompletar: o proprio catalogo da pessoa, os mais usados
   * primeiro. E o que faz o nome digitado uma vez nunca mais precisar ser
   * digitado inteiro -- e o que mantem o slug consistente.
   */
  async sugestoes(userId: string) {
    const exercicios = await this.prisma.exercise.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        _count: { select: { sets: true } },
      },
    });

    return {
      exercicios: exercicios
        .map((e) => ({ id: e.id, nome: e.name, series: e._count.sets }))
        .sort((a, b) => b.series - a.series || a.nome.localeCompare(b.nome)),
    };
  }

  /**
   * Os pontos do grafico de um exercicio, com o recorde.
   *
   * So conta serie de treino CONTABIL -- a mesma regra de `ehContabil` em
   * `sessions/regras.ts`, que hoje aceita apenas COMPLETED. Sessao curta demais
   * (SHORT) ou fechada pelo sistema (AUTO_CLOSED) nao empurra linha no grafico.
   * Se `ehContabil` mudar um dia, este filtro tem de mudar junto.
   */
  async progressaoDe(userId: string, exerciseId: string) {
    const exercicio = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, userId },
      select: { id: true, name: true },
    });
    if (!exercicio) throw new NotFoundException('Exercicio nao encontrado');

    const series = await this.prisma.exerciseSet.findMany({
      where: {
        exerciseId,
        session: { userId, status: SessionStatus.COMPLETED },
      },
      select: { reps: true, weightG: true, session: { select: { dayKey: true } } },
    });

    const pontos = progressao(
      series.map((s) => ({ dia: s.session.dayKey, reps: s.reps, pesoG: s.weightG })),
    );

    return {
      exercicio: { id: exercicio.id, nome: exercicio.name },
      pontos,
      recorde: recorde(pontos),
    };
  }

  /**
   * O ultimo treino em que este exercicio apareceu -- a base do "repetir".
   *
   * Existe porque repeticao e a norma: quase todo treino refaz os exercicios do
   * anterior com a mesma carga ou perto dela. Sem isto, a pessoa digita tudo de
   * novo a cada vez, e e ai que se desiste de registrar.
   */
  async ultimaVez(userId: string, exerciseId: string, ignorarSessionId?: string) {
    const ultima = await this.prisma.exerciseSet.findFirst({
      where: {
        exerciseId,
        exercise: { userId },
        sessionId: ignorarSessionId ? { not: ignorarSessionId } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: { sessionId: true, session: { select: { dayKey: true } } },
    });
    if (!ultima) return { dia: null, series: [] };

    const series = await this.prisma.exerciseSet.findMany({
      where: { exerciseId, sessionId: ultima.sessionId },
      orderBy: { position: 'asc' },
      select: { reps: true, weightG: true },
    });

    return {
      dia: ultima.session.dayKey,
      series: series.map((s) => ({ reps: s.reps, pesoG: s.weightG })),
    };
  }
}
