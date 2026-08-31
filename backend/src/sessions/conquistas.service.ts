import { Achievement, AchievementKind, SessionStatus, WeekStatus } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConquistaAvaliada,
  estatisticasDosDias,
  EstatisticasDoUsuario,
  MARCOS,
  marcosAlcancados,
  proximoMarco,
  RECORDE_MINIMO_PARA_FESTA,
  RECORDES,
  recordesAtuais,
} from './conquistas';

/**
 * Conquistas avaliadas na leitura, como o fechamento semanal.
 *
 * Mesmo motivo de la: nao existe job neste projeto enquanto o backend dormir no
 * plano free. E o mesmo beneficio: a linha e unica por (usuario, codigo), entao
 * repetir a avaliacao nao duplica nem re-comemora nada.
 */
@Injectable()
export class ConquistasService {
  constructor(private readonly prisma: PrismaService) {}

  protected agora(): Date {
    return new Date();
  }

  /**
   * O retrato do qual tudo e deduzido. Duas consultas: os dias treinados (que
   * ja trazem minutos) e as semanas fechadas.
   */
  private async estatisticas(userId: string): Promise<EstatisticasDoUsuario> {
    const [porDia, semanas] = await Promise.all([
      this.prisma.workoutSession.groupBy({
        by: ['dayKey'],
        where: { userId, status: SessionStatus.COMPLETED },
        _sum: { durationMin: true },
      }),
      this.prisma.weeklyResult.findMany({
        where: { userId },
        select: { status: true, streakDepois: true, reparo: true },
      }),
    ]);

    const dias = porDia.map((d) => ({
      dia: d.dayKey,
      minutos: d._sum.durationMin ?? 0,
    }));

    return {
      ...estatisticasDosDias(dias),
      semanasCumpridas: semanas.filter((s) => s.status === WeekStatus.CUMPRIDA).length,
      melhorStreakSemanas: Math.max(0, ...semanas.map((s) => s.streakDepois)),
      reparou: semanas.some((s) => s.reparo),
    };
  }

  /**
   * Avalia e grava o que mudou. Devolve as conquistas ainda NAO comemoradas --
   * e o que a tela usa para fazer a festa uma vez so.
   */
  async avaliar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado');

    const stats = await this.estatisticas(userId);
    const existentes = await this.prisma.achievement.findMany({ where: { userId } });
    const porCodigo = new Map(existentes.map((a) => [a.code, a]));

    const alcancadas: ConquistaAvaliada[] = [
      ...marcosAlcancados(stats),
      ...recordesAtuais(stats),
    ];

    for (const conquista of alcancadas) {
      const gravada = porCodigo.get(conquista.code);

      if (!gravada) {
        await this.criar(userId, conquista);
        continue;
      }

      // Marco nao muda depois de conquistado.
      if (conquista.kind === AchievementKind.MARCO) continue;

      // Recorde: so mexe quando a marca antiga cai de verdade.
      if ((conquista.value ?? 0) <= (gravada.value ?? 0)) continue;

      await this.prisma.achievement.update({
        where: { id: gravada.id },
        data: {
          value: conquista.value,
          unlockedAt: this.agora(),
          seenAt: null,
        },
      });
    }

    const naoVistas = await this.prisma.achievement.findMany({
      where: { userId, seenAt: null },
      orderBy: { unlockedAt: 'asc' },
    });

    return {
      novas: naoVistas.map((a) => this.paraResposta(a)),
      total: await this.prisma.achievement.count({
        where: { userId, kind: AchievementKind.MARCO },
      }),
      proximo: proximoMarco(
        stats,
        new Set(
          [...porCodigo.values(), ...alcancadas]
            .filter((a) => a.kind === AchievementKind.MARCO)
            .map((a) => a.code),
        ),
      ),
    };
  }

  private async criar(userId: string, conquista: ConquistaAvaliada) {
    // A PRIMEIRA marca de um recorde nao vira festa: comemorar "1 dia seguido"
    // no primeiro treino seria barulho em cima do marco que ja existe. So a
    // superacao comemora -- e so a partir de um valor que signifique algo.
    const comemora =
      conquista.kind === AchievementKind.MARCO ||
      (conquista.value ?? 0) >= RECORDE_MINIMO_PARA_FESTA;

    try {
      await this.prisma.achievement.create({
        data: {
          userId,
          code: conquista.code,
          kind: conquista.kind,
          value: conquista.value,
          unlockedAt: this.agora(),
          seenAt: comemora ? null : this.agora(),
        },
      });
    } catch (erro) {
      // Duas leituras simultaneas conquistando a mesma coisa: a unicidade no
      // banco decide e a perdedora nao tem nada a corrigir.
      if ((erro as { code?: string })?.code !== 'P2002') throw erro;
    }
  }

  /** Marca a festa como feita. Sem isso, a tela comemoraria em toda visita. */
  async marcarVistas(userId: string) {
    const { count } = await this.prisma.achievement.updateMany({
      where: { userId, seenAt: null },
      data: { seenAt: this.agora() },
    });

    return { marcadas: count };
  }

  /** O catalogo inteiro: o que ja foi conquistado e o que ainda falta. */
  async listar(userId: string) {
    await this.avaliar(userId);

    const gravadas = await this.prisma.achievement.findMany({ where: { userId } });
    const porCodigo = new Map(gravadas.map((a) => [a.code, a]));

    return {
      marcos: MARCOS.map((m) => {
        const gravada = porCodigo.get(m.code);
        return {
          code: m.code,
          nome: m.nome,
          descricao: m.descricao,
          conquistado: Boolean(gravada),
          em: gravada?.unlockedAt ?? null,
        };
      }),
      recordes: RECORDES.map((r) => {
        const gravada = porCodigo.get(r.code);
        return {
          code: r.code,
          nome: r.nome,
          unidade: r.unidade,
          valor: gravada?.value ?? 0,
          em: gravada?.unlockedAt ?? null,
        };
      }),
    };
  }

  private paraResposta(a: Achievement) {
    const marco = MARCOS.find((m) => m.code === a.code);
    const recorde = RECORDES.find((r) => r.code === a.code);

    return {
      code: a.code,
      kind: a.kind,
      nome: marco?.nome ?? recorde?.nome ?? a.code,
      descricao: marco?.descricao ?? null,
      unidade: recorde?.unidade ?? null,
      valor: a.value,
      em: a.unlockedAt,
    };
  }
}
