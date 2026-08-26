import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionSource, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_FECHAMENTO_MIN,
  classificar,
  cooldownRestante,
  DURACAO_MIN_MIN,
  ehContabil,
} from './regras';
import { chaveDoDia, minutosEntre, semanaDe, somarDias } from './tempo';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // O relogio fica isolado num metodo pra os testes poderem congelar o tempo.
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

  private async grupoDoUsuario(userId: string): Promise<string | null> {
    const vinculo = await this.prisma.membership.findFirst({
      where: { userId },
      select: { groupId: true },
      orderBy: { createdAt: 'asc' },
    });

    return vinculo?.groupId ?? null;
  }

  /**
   * Fecha sessoes esquecidas abertas ha mais de AUTO_FECHAMENTO_MIN. O fim e
   * fixado no limite (inicio + 6h), nao em "agora", pra uma sessao esquecida
   * por tres dias nao virar um treino de 72h. Nao e contabil.
   */
  async fecharAbandonadas(userId: string): Promise<number> {
    const abertas = await this.prisma.workoutSession.findMany({
      where: { userId, status: SessionStatus.OPEN },
    });

    let fechadas = 0;
    for (const sessao of abertas) {
      if (minutosEntre(sessao.startedAt, this.agora()) <= AUTO_FECHAMENTO_MIN) continue;

      const fim = new Date(sessao.startedAt.getTime() + AUTO_FECHAMENTO_MIN * 60000);
      await this.prisma.workoutSession.update({
        where: { id: sessao.id },
        data: {
          status: SessionStatus.AUTO_CLOSED,
          endedAt: fim,
          durationMin: AUTO_FECHAMENTO_MIN,
          source: SessionSource.SYSTEM,
        },
      });
      fechadas++;
    }

    return fechadas;
  }

  async emAndamento(userId: string) {
    await this.fecharAbandonadas(userId);

    const aberta = await this.prisma.workoutSession.findFirst({
      where: { userId, status: SessionStatus.OPEN },
    });

    return aberta ? this.paraResposta(aberta) : null;
  }

  /** Inicia um treino. O horario vem SEMPRE do servidor. */
  async abrir(userId: string) {
    const user = await this.usuario(userId);
    await this.fecharAbandonadas(userId);

    const aberta = await this.prisma.workoutSession.findFirst({
      where: { userId, status: SessionStatus.OPEN },
    });
    if (aberta) {
      throw new BadRequestException('Voce ja tem um treino em andamento');
    }

    const agora = this.agora();

    // Cooldown: olha o fim mais recente, qualquer que seja o status -- e isso
    // que impede a rajada de treinos de 1 segundo.
    const ultima = await this.prisma.workoutSession.findFirst({
      where: { userId, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true },
    });

    const faltam = cooldownRestante(ultima?.endedAt ?? null, agora);
    if (faltam > 0) {
      throw new BadRequestException(
        `Aguarde ${faltam} min para iniciar outro treino`,
      );
    }

    return this.prisma.workoutSession.create({
      data: {
        userId,
        groupId: await this.grupoDoUsuario(userId),
        startedAt: agora,
        dayKey: chaveDoDia(agora, user.timezone),
        status: SessionStatus.OPEN,
        source: SessionSource.APP,
      },
    });
  }

  /** Finaliza o treino em andamento, aplicando duracao minima e maxima. */
  async fechar(userId: string) {
    await this.usuario(userId);
    await this.fecharAbandonadas(userId);

    const aberta = await this.prisma.workoutSession.findFirst({
      where: { userId, status: SessionStatus.OPEN },
    });
    if (!aberta) {
      throw new BadRequestException('Nenhum treino em andamento');
    }

    const fim = this.agora();
    const { status, durationMin } = classificar(minutosEntre(aberta.startedAt, fim));

    return this.prisma.workoutSession.update({
      where: { id: aberta.id },
      data: { status, endedAt: fim, durationMin },
    });
  }

  /** Um botao so, como a tela de hoje: abre se estiver fechado, fecha se aberto. */
  async alternar(userId: string) {
    const aberta = await this.emAndamento(userId);
    const sessao = aberta ? await this.fechar(userId) : await this.abrir(userId);

    // Mesma forma de resposta em todo lugar: a tela nao lida com dois formatos.
    return this.paraResposta(sessao);
  }

  /**
   * Streak em dias, no fuso do usuario. Conta apenas dias com sessao CONTABIL,
   * entao treino de 1 segundo nao alimenta mais a sequencia.
   */
  async streak(userId: string): Promise<number> {
    const user = await this.usuario(userId);

    const dias = await this.prisma.workoutSession.findMany({
      where: { userId, status: SessionStatus.COMPLETED },
      select: { dayKey: true },
      distinct: ['dayKey'],
    });

    const comTreino = new Set(dias.map((d) => d.dayKey));
    const hoje = chaveDoDia(this.agora(), user.timezone);

    // Se ainda nao treinou hoje, a sequencia pode estar viva desde ontem.
    let cursor = comTreino.has(hoje) ? hoje : somarDias(hoje, -1);
    let streak = 0;
    while (comTreino.has(cursor)) {
      streak++;
      cursor = somarDias(cursor, -1);
    }

    return streak;
  }

  /**
   * Resumo da semana ISO corrente, no fuso do usuario.
   *
   * `treinos` conta DIAS distintos com sessao contabil (nao sessoes): e a regra
   * de "1 treino contavel por dia", que fecha o furo de inflar o contador
   * abrindo e fechando varias sessoes no mesmo dia. Os `minutos` somam todas as
   * sessoes contabeis, porque quem realmente treinou duas vezes no dia merece
   * ver o tempo somado.
   */
  async resumoSemanal(userId: string): Promise<{ treinos: number; minutos: number }> {
    const user = await this.usuario(userId);
    const { inicio, fim } = semanaDe(this.agora(), user.timezone);

    // dayKey e YYYY-MM-DD, entao a comparacao de texto ja ordena por data.
    const sessoes = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        status: SessionStatus.COMPLETED,
        dayKey: { gte: inicio, lte: fim },
      },
      select: { dayKey: true, durationMin: true },
    });

    const dias = new Set(sessoes.map((s) => s.dayKey));
    const minutos = sessoes.reduce((total, s) => total + (s.durationMin ?? 0), 0);

    return { treinos: dias.size, minutos };
  }

  async resumo(userId: string) {
    const [emAndamento, streak, semana] = await Promise.all([
      this.emAndamento(userId),
      this.streak(userId),
      this.resumoSemanal(userId),
    ]);

    return {
      emAndamento,
      streak,
      semana,
      regras: { duracaoMinimaMin: DURACAO_MIN_MIN },
    };
  }

  private paraResposta(sessao: {
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    durationMin: number | null;
    status: SessionStatus;
    source: SessionSource;
    dayKey: string;
  }) {
    return {
      id: sessao.id,
      startedAt: sessao.startedAt,
      endedAt: sessao.endedAt,
      durationMin: sessao.durationMin,
      status: sessao.status,
      source: sessao.source,
      dayKey: sessao.dayKey,
      // Deixa explicito na resposta se a sessao entra nas contas, pra a tela
      // nao ter de reimplementar a regra.
      contavel: ehContabil(sessao.status),
    };
  }

  /**
   * Historico paginado por cursor. Cursor em vez de offset porque a lista
   * cresce pelo topo: com `skip` numerico, abrir um treino durante a rolagem
   * empurraria os itens e repetiria registros.
   */
  async listar(userId: string, opcoes: { cursor?: string; limite?: number } = {}) {
    const limite = Math.min(Math.max(opcoes.limite ?? 20, 1), 50);

    const encontradas = await this.prisma.workoutSession.findMany({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limite + 1, // 1 extra so pra saber se existe proxima pagina
      ...(opcoes.cursor ? { cursor: { id: opcoes.cursor }, skip: 1 } : {}),
    });

    const temMais = encontradas.length > limite;
    const itens = temMais ? encontradas.slice(0, limite) : encontradas;

    return {
      itens: itens.map((s) => this.paraResposta(s)),
      proximoCursor: temMais ? itens[itens.length - 1].id : null,
    };
  }

  /** Historico + numeros da home numa so ida ao servidor. */
  async historicoComResumo(userId: string, opcoes: { cursor?: string; limite?: number } = {}) {
    await this.fecharAbandonadas(userId);

    const [pagina, resumo] = await Promise.all([
      this.listar(userId, opcoes),
      this.resumo(userId),
    ]);

    return { ...pagina, resumo };
  }

  /**
   * Correcao auditada. Editar NAO sobrescreve em silencio: grava em
   * SessionCorrection o antes, o depois, quem fez e por que -- tudo na mesma
   * transacao, pra nunca existir mudanca sem rastro.
   *
   * E a unica porta por onde um horario vindo do cliente e aceito, e justamente
   * por isso ela e auditada.
   */
  async corrigir(
    autorId: string,
    sessionId: string,
    dados: { startedAt?: string; endedAt?: string; reason: string },
    ehSupervisor = false,
  ) {
    const sessao = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      include: { user: { select: { timezone: true } } },
    });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.userId !== autorId && !ehSupervisor) {
      throw new ForbiddenException('Voce so pode corrigir os seus treinos');
    }

    if (sessao.status === SessionStatus.OPEN) {
      throw new BadRequestException(
        'Finalize o treino antes de corrigir os horarios',
      );
    }

    const inicioNovo = dados.startedAt ? new Date(dados.startedAt) : sessao.startedAt;
    const fimNovo = dados.endedAt ? new Date(dados.endedAt) : sessao.endedAt;

    if (Number.isNaN(inicioNovo.getTime()) || (fimNovo && Number.isNaN(fimNovo.getTime()))) {
      throw new BadRequestException('Data invalida');
    }
    if (!fimNovo) {
      throw new BadRequestException('A sessao precisa ter um fim');
    }
    if (fimNovo.getTime() <= inicioNovo.getTime()) {
      throw new BadRequestException('O fim tem de ser depois do inicio');
    }
    if (fimNovo.getTime() > this.agora().getTime()) {
      throw new BadRequestException('Nao da pra registrar treino no futuro');
    }

    // A correcao passa pelas MESMAS regras de duracao: senao seria o caminho
    // facil pra burlar a duracao minima e o teto.
    const { status, durationMin } = classificar(minutosEntre(inicioNovo, fimNovo));

    return this.prisma.$transaction(async (tx) => {
      await tx.sessionCorrection.create({
        data: {
          sessionId: sessao.id,
          authorId: autorId,
          reason: dados.reason,
          startedAtBefore: sessao.startedAt,
          startedAtAfter: inicioNovo,
          endedAtBefore: sessao.endedAt,
          endedAtAfter: fimNovo,
          statusBefore: sessao.status,
          statusAfter: status,
        },
      });

      const atualizada = await tx.workoutSession.update({
        where: { id: sessao.id },
        data: {
          startedAt: inicioNovo,
          endedAt: fimNovo,
          durationMin,
          status,
          source: SessionSource.CORRECTION,
          dayKey: chaveDoDia(inicioNovo, sessao.user.timezone),
        },
      });

      return this.paraResposta(atualizada);
    });
  }

  /** Trilha de auditoria de uma sessao, do mais recente pro mais antigo. */
  async correcoes(autorId: string, sessionId: string, ehSupervisor = false) {
    const sessao = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.userId !== autorId && !ehSupervisor) {
      throw new ForbiddenException('Voce so pode ver os seus treinos');
    }

    return this.prisma.sessionCorrection.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
