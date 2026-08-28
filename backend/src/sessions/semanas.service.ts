import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus, WeeklyResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ESTADO_INICIAL,
  EstadoSemanal,
  fecharSemana,
  META_MAX,
  META_MIN,
  metaValida,
  SEMANAS_DE_AUSENCIA,
  trimestreDe,
} from './semanas';
import { inicioDaSemana, semanaDe, semanasEntre, somarDias } from './tempo';

/**
 * Ate quantas semanas para tras o fechamento preguicoso reconstroi. Quem some
 * por mais de um ano volta do zero -- e o que a regra de ausencia longa manda
 * de qualquer jeito -- e o teto impede que uma unica leitura tenha de gravar
 * centenas de linhas de uma vez.
 */
const MAX_SEMANAS_RETROATIVAS = 53;

type Config = { meta: number; metaPendente: number | null; metaValidaDe: string | null };

/**
 * Fechamento semanal SEM job agendado.
 *
 * O backend dorme no plano free do Render depois de 15 min sem uso, entao um
 * cron in-process simplesmente nao dispararia as 00:05 de segunda -- o horario
 * em que ele com certeza esta dormindo. Em vez de depender de um agendador
 * externo (mais um segredo, mais uma peca que cai calada), a semana fecha na
 * primeira leitura depois que ela acabou: as linhas sao idempotentes por
 * (usuario, semana), entao repetir o fechamento nao muda nada, e ninguem
 * precisa estar acordado no domingo a meia-noite.
 */
@Injectable()
export class SemanasService {
  constructor(private readonly prisma: PrismaService) {}

  // Isolado para os testes congelarem o tempo, como em SessionsService.
  protected agora(): Date {
    return new Date();
  }

  private async usuario(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timezone: true },
    });

    if (!user) throw new NotFoundException('Usuario nao encontrado');
    return user;
  }

  private async config(userId: string): Promise<Config> {
    const existente = await this.prisma.weeklyGoal.findUnique({ where: { userId } });
    if (existente) return existente;

    // Criada na primeira leitura, em vez de no cadastro: assim quem ja tinha
    // conta antes da v1.0 nao precisa de backfill nenhum.
    //
    // Nao e upsert de proposito: `update: {}` mexeria no updatedAt a cada
    // leitura, ou seja, uma escrita no caminho mais quente do app. Aqui a
    // escrita acontece uma vez na vida, e a corrida do primeiro acesso (duas
    // abas abrindo juntas) cai na unicidade e le o que a outra gravou.
    try {
      return await this.prisma.weeklyGoal.create({ data: { userId } });
    } catch (erro) {
      if (!this.ehConflito(erro)) throw erro;
      return this.prisma.weeklyGoal.findUniqueOrThrow({ where: { userId } });
    }
  }

  /**
   * Poe em vigor a meta agendada quando a semana dela chega. Chamado antes de
   * fechar cada semana, na ordem cronologica, para uma semana antiga nunca ser
   * julgada por uma meta que so passou a valer depois dela.
   */
  private async aplicarMetaAgendada(
    userId: string,
    config: Config,
    semana: string,
  ): Promise<Config> {
    if (config.metaPendente === null || config.metaValidaDe === null) return config;
    if (config.metaValidaDe > semana) return config;

    return this.prisma.weeklyGoal.update({
      where: { userId },
      data: { meta: config.metaPendente, metaPendente: null, metaValidaDe: null },
    });
  }

  /** A linha mais recente e, sozinha, o estado atual da pessoa. */
  private estadoDe(linha: WeeklyResult | null): EstadoSemanal {
    if (!linha) return ESTADO_INICIAL;

    return {
      streakSemanas: linha.streakDepois,
      tokens: linha.tokensDepois,
      cumpridasSeguidas: linha.cumpridasSeguidas,
      streakSalva: linha.streakSalva,
      ultimoReparoEm: linha.ultimoReparoEm,
    };
  }

  /** Dias distintos com treino contavel, agrupados por semana, numa consulta so. */
  private async diasPorSemana(userId: string, de: string, ate: string) {
    const dias = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        status: SessionStatus.COMPLETED,
        dayKey: { gte: de, lte: ate },
      },
      select: { dayKey: true },
      distinct: ['dayKey'],
    });

    const contagem = new Map<string, number>();
    for (const { dayKey } of dias) {
      const semana = inicioDaSemana(dayKey);
      contagem.set(semana, (contagem.get(semana) ?? 0) + 1);
    }

    return contagem;
  }

  /**
   * Fecha todas as semanas que ja acabaram e ainda nao tinham linha. A semana
   * corrente NUNCA e fechada: ela ainda esta sendo vivida.
   */
  async fecharPendentes(userId: string) {
    const user = await this.usuario(userId);
    let config = await this.config(userId);

    const semanaAtual = semanaDe(this.agora(), user.timezone).inicio;

    const ultima = await this.prisma.weeklyResult.findFirst({
      where: { userId },
      orderBy: { semanaInicio: 'desc' },
    });
    let estado = this.estadoDe(ultima);

    let cursor: string;
    if (ultima) {
      cursor = somarDias(ultima.semanaInicio, 7);
    } else {
      // Sem historico: comeca na semana do primeiro treino contavel. Quem
      // nunca treinou nao tem semana para fechar -- abrir a conta de alguem
      // com uma sequencia de semanas perdidas seria cobranca sem causa.
      const primeiro = await this.prisma.workoutSession.findFirst({
        where: { userId, status: SessionStatus.COMPLETED },
        orderBy: { dayKey: 'asc' },
        select: { dayKey: true },
      });
      if (!primeiro) {
        // Nada a fechar -- mas a meta agendada ainda tem de entrar em vigor,
        // senao quem trocou a meta antes do primeiro treino ficaria preso na
        // meta antiga para sempre.
        config = await this.aplicarMetaAgendada(userId, config, semanaAtual);
        return { estado, config, timezone: user.timezone };
      }
      cursor = inicioDaSemana(primeiro.dayKey);
    }

    if (semanasEntre(cursor, semanaAtual) > MAX_SEMANAS_RETROATIVAS) {
      // Ausencia longa demais para reconstruir linha a linha. Volta do zero,
      // que e onde a regra de ausencia levaria de qualquer forma.
      cursor = somarDias(semanaAtual, -7 * MAX_SEMANAS_RETROATIVAS);
      estado = ESTADO_INICIAL;
    }

    if (cursor >= semanaAtual) {
      config = await this.aplicarMetaAgendada(userId, config, semanaAtual);
      return { estado, config, timezone: user.timezone };
    }

    const contagem = await this.diasPorSemana(userId, cursor, somarDias(semanaAtual, -1));

    while (cursor < semanaAtual) {
      config = await this.aplicarMetaAgendada(userId, config, cursor);

      const { resultado, estado: novo } = fecharSemana(estado, {
        semanaInicio: cursor,
        meta: config.meta,
        treinos: contagem.get(cursor) ?? 0,
      });

      try {
        await this.prisma.weeklyResult.create({
          data: {
            userId,
            semanaInicio: cursor,
            semanaFim: somarDias(cursor, 6),
            ...resultado,
            ultimoReparoEm: resultado.reparo ? cursor : estado.ultimoReparoEm,
          },
        });
        estado = novo;
      } catch (erro) {
        // Duas requisicoes simultaneas fechando a mesma semana: a unicidade no
        // banco decide, e quem perdeu adota o resultado de quem ganhou em vez
        // de recalcular por cima.
        if (!this.ehConflito(erro)) throw erro;

        const gravada = await this.prisma.weeklyResult.findUnique({
          where: { userId_semanaInicio: { userId, semanaInicio: cursor } },
        });
        estado = this.estadoDe(gravada);
      }

      cursor = somarDias(cursor, 7);
    }

    config = await this.aplicarMetaAgendada(userId, config, semanaAtual);

    return { estado, config, timezone: user.timezone };
  }

  private ehConflito(erro: unknown): boolean {
    return (erro as { code?: string })?.code === 'P2002';
  }

  /** Estado da meta para a home: semana corrente + sequencia de semanas. */
  async resumo(userId: string) {
    const { estado, config, timezone } = await this.fecharPendentes(userId);
    const { inicio, fim } = semanaDe(this.agora(), timezone);

    const dias = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        status: SessionStatus.COMPLETED,
        dayKey: { gte: inicio, lte: fim },
      },
      select: { dayKey: true },
      distinct: ['dayKey'],
    });
    const treinos = dias.length;

    return {
      semana: { inicio, fim },
      meta: config.meta,
      treinos,
      faltam: Math.max(0, config.meta - treinos),
      cumprida: treinos >= config.meta,
      streakSemanas: estado.streakSemanas,
      tokens: estado.tokens,
      // A meta nova aparece como "agendada" ate a semana dela chegar.
      metaAgendada:
        config.metaPendente !== null
          ? { meta: config.metaPendente, validaDe: config.metaValidaDe }
          : null,
      // Quando a semana passada foi PERDIDA, a tela pode oferecer o reparo em
      // vez de so anunciar a perda.
      reparo: this.reparoDisponivel(estado, config.meta, inicio),
      recomeco: await this.emRecomeco(userId, estado, treinos),
      limites: { metaMin: META_MIN, metaMax: META_MAX },
    };
  }

  private reparoDisponivel(estado: EstadoSemanal, meta: number, semana: string) {
    if (estado.streakSalva === null || estado.streakSalva <= 0) return null;
    if (
      estado.ultimoReparoEm !== null &&
      trimestreDe(estado.ultimoReparoEm) === trimestreDe(semana)
    ) {
      return null;
    }

    return { streakSalva: estado.streakSalva, exige: meta + 1 };
  }

  /**
   * Modo recomeco: quatro semanas ou mais sem nenhum treino. Existe para a tela
   * trocar o tom -- quem volta depois de um mes fora nao precisa ver um zero
   * com cara de cobranca. Nao muda numero nenhum, so o texto.
   */
  private async emRecomeco(userId: string, estado: EstadoSemanal, treinosDaSemana: number) {
    if (estado.streakSemanas > 0 || treinosDaSemana > 0) return false;

    const ultimas = await this.prisma.weeklyResult.findMany({
      where: { userId },
      orderBy: { semanaInicio: 'desc' },
      take: SEMANAS_DE_AUSENCIA,
      select: { treinos: true },
    });

    return ultimas.length >= SEMANAS_DE_AUSENCIA && ultimas.every((s) => s.treinos === 0);
  }

  /**
   * Troca a meta. Vale a partir da SEMANA SEGUINTE, sempre: mudar a meta da
   * semana corrente seria fabricar sucesso no domingo a noite, baixando de 5
   * para 3 depois de ver quantos treinos deu.
   */
  async alterarMeta(userId: string, meta: number) {
    if (!metaValida(meta)) {
      throw new BadRequestException(
        `A meta tem de ser de ${META_MIN} a ${META_MAX} treinos por semana`,
      );
    }

    const user = await this.usuario(userId);
    const atual = await this.config(userId);

    const semanaAtual = semanaDe(this.agora(), user.timezone).inicio;

    // Voltar para a meta que ja vale e so cancelar o agendamento.
    const dados =
      atual.meta === meta
        ? { metaPendente: null, metaValidaDe: null }
        : { metaPendente: meta, metaValidaDe: somarDias(semanaAtual, 7) };

    const salvo = await this.prisma.weeklyGoal.update({ where: { userId }, data: dados });

    return {
      meta: salvo.meta,
      metaAgendada:
        salvo.metaPendente !== null
          ? { meta: salvo.metaPendente, validaDe: salvo.metaValidaDe }
          : null,
    };
  }

  /** Semanas ja fechadas, da mais recente para a mais antiga. */
  async historico(userId: string, limite = 12) {
    await this.fecharPendentes(userId);

    const semanas = await this.prisma.weeklyResult.findMany({
      where: { userId },
      orderBy: { semanaInicio: 'desc' },
      take: Math.min(Math.max(limite, 1), 52),
    });

    return semanas.map((s) => ({
      semanaInicio: s.semanaInicio,
      semanaFim: s.semanaFim,
      meta: s.meta,
      treinos: s.treinos,
      status: s.status,
      reparo: s.reparo,
      congelamentoUsado: s.congelamentoUsado,
      streakDepois: s.streakDepois,
    }));
  }
}
