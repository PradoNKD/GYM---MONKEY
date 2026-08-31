import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionSource, SessionStatus, WorkoutType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SemanasService } from './semanas.service';
import {
  AUMENTO_MAX_CORRECAO_MIN,
  AUTO_FECHAMENTO_MIN,
  baseParaAumento,
  classificar,
  cooldownRestante,
  DURACAO_MIN_MIN,
  ehContabil,
} from './regras';
import { janelaDoMapa } from './mapa';
import {
  ESFORCO_MAX,
  ESFORCO_MIN,
  MAX_TIPOS,
  normalizarRegistro,
  NOTA_MAX,
  RegistroEntrada,
} from './registro';
import { chaveDoDia, minutosEntre, semanaDe, somarDias } from './tempo';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semanas: SemanasService,
  ) {}

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
   *
   * A partir da v1.0 o numero que manda na home e a semana, nao o dia: streak
   * diaria pune o descanso, porque para nao perde-la a pessoa precisa treinar
   * todo santo dia. Ela continua aqui, mas com o RECORDE junto -- exibir o
   * recorde e comemorar o que a pessoa ja fez; exibir so o atual e mostrar,
   * todo dia de folga, um numero caindo.
   */
  async streaks(userId: string): Promise<{ atual: number; recorde: number }> {
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
    let atual = 0;
    while (comTreino.has(cursor)) {
      atual++;
      cursor = somarDias(cursor, -1);
    }

    // Recorde: cada dia sem o anterior e o inicio de uma corrida; a partir dele
    // se anda para frente. Assim cada dia e visitado uma vez so.
    let recorde = 0;
    for (const dia of comTreino) {
      if (comTreino.has(somarDias(dia, -1))) continue;

      let corrida = 0;
      let passo = dia;
      while (comTreino.has(passo)) {
        corrida++;
        passo = somarDias(passo, 1);
      }
      recorde = Math.max(recorde, corrida);
    }

    return { atual, recorde };
  }

  async streak(userId: string): Promise<number> {
    return (await this.streaks(userId)).atual;
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
    const [emAndamento, diarias, semana, meta] = await Promise.all([
      this.emAndamento(userId),
      this.streaks(userId),
      this.resumoSemanal(userId),
      // Fecha as semanas vencidas de passagem: e o que substitui o job
      // agendado, que nao teria como rodar com o backend dormindo.
      this.semanas.resumo(userId),
    ]);

    return {
      emAndamento,
      // Mantido para nao quebrar quem ja consome: e a streak diaria atual.
      streak: diarias.atual,
      recordeDiario: diarias.recorde,
      semana,
      meta,
      regras: {
        duracaoMinimaMin: DURACAO_MIN_MIN,
        // A tela nao precisa repetir estes numeros: eles moram aqui e no DTO.
        registro: {
          tiposMax: MAX_TIPOS,
          esforcoMin: ESFORCO_MIN,
          esforcoMax: ESFORCO_MAX,
          notaMax: NOTA_MAX,
        },
      },
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
    workoutTypes: WorkoutType[];
    effort: number | null;
    note: string | null;
  }, jaCorrigida = false) {
    return {
      id: sessao.id,
      startedAt: sessao.startedAt,
      endedAt: sessao.endedAt,
      durationMin: sessao.durationMin,
      status: sessao.status,
      source: sessao.source,
      dayKey: sessao.dayKey,
      // Registro da Fase A. Sempre presente na resposta (lista vazia / nulos),
      // pra tela nao ter de tratar "campo que as vezes vem".
      workoutTypes: sessao.workoutTypes,
      effort: sessao.effort,
      note: sessao.note,
      // Deixa explicito na resposta se a sessao entra nas contas, pra a tela
      // nao ter de reimplementar a regra.
      contavel: ehContabil(sessao.status),
      // Mesma ideia pro lapis de correcao: a tela nao precisa saber que sao
      // "uma correcao por sessao" e "nao corrige treino em andamento" -- ela
      // so esconde o botao quando isto vem false. Assim a regra mora num lugar.
      corrigivel: sessao.status !== SessionStatus.OPEN && !jaCorrigida,
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
      // Conta as correcoes na mesma consulta: e o que diz a tela se o lapis
      // ainda deve aparecer (uma correcao por sessao).
      include: { _count: { select: { corrections: true } } },
    });

    const temMais = encontradas.length > limite;
    const itens = temMais ? encontradas.slice(0, limite) : encontradas;

    return {
      itens: itens.map((s) => this.paraResposta(s, s._count.corrections > 0)),
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
   * Mapa dos dias treinados, para a grade do ano.
   *
   * Devolve SO os dias com treino contavel: ausencia e fundo neutro na tela,
   * nao dado. Assim a resposta e curta mesmo com um ano de janela, e a tela nao
   * precisa filtrar nada.
   */
  async mapa(userId: string) {
    const user = await this.usuario(userId);
    const hoje = chaveDoDia(this.agora(), user.timezone);

    const primeiro = await this.prisma.workoutSession.findFirst({
      where: { userId, status: SessionStatus.COMPLETED },
      orderBy: { dayKey: 'asc' },
      select: { dayKey: true },
    });

    const { inicio, fim } = janelaDoMapa(primeiro?.dayKey ?? null, hoje);

    const agrupados = await this.prisma.workoutSession.groupBy({
      by: ['dayKey'],
      where: {
        userId,
        status: SessionStatus.COMPLETED,
        dayKey: { gte: inicio, lte: fim },
      },
      _count: { _all: true },
      _sum: { durationMin: true },
    });

    const dias = agrupados
      .map((d) => ({
        dia: d.dayKey,
        treinos: d._count._all,
        minutos: d._sum.durationMin ?? 0,
      }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return {
      inicio,
      fim,
      dias,
      total: {
        dias: dias.length,
        treinos: dias.reduce((t, d) => t + d.treinos, 0),
        minutos: dias.reduce((t, d) => t + d.minutos, 0),
      },
    };
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

    // ---- Travas contra reescrita de historico (auditoria de 2026-08-27) ----
    //
    // Antes destas, a correcao era o caminho pra FABRICAR treino: dava pra
    // pegar uma sessao de 3 minutos de hoje e reescrever como 62 minutos num
    // dia qualquer do passado. Medido: streak foi de 1 pra 3 e a semana de 2
    // pra 3 treinos, usando duas correcoes na mesma sessao. A auditoria
    // registrava tudo -- e nao impedia nada.

    // 1. O inicio nao se mexe. Ele e o unico dado de onde sai o `dayKey`, ou
    //    seja, EM QUE DIA o treino conta. Corrigir "esqueci de finalizar" nunca
    //    precisa mexer no inicio -- o inicio foi o servidor que gravou, na hora
    //    em que a pessoa apertou o botao. O supervisor pode, e fica auditado.
    if (!ehSupervisor && dados.startedAt !== undefined) {
      throw new BadRequestException(
        'So o horario de fim pode ser corrigido. Para mudar o inicio, peca a um supervisor.',
      );
    }

    // 2. Uma correcao por sessao. O golpe medido precisou de duas: a primeira
    //    tornava a sessao contavel, a segunda a movia pro dia que interessava.
    if (!ehSupervisor) {
      const jaCorrigidas = await this.prisma.sessionCorrection.count({
        where: { sessionId: sessao.id },
      });
      if (jaCorrigidas > 0) {
        throw new BadRequestException(
          'Este treino ja foi corrigido uma vez. Peca a um supervisor.',
        );
      }
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

    // 3. O fim tem de caber na janela de auto-encerramento (6h) contada do
    //    inicio. Sem isso, o fim podia ser posto dias depois: a duracao era
    //    truncada no teto de 4h e a sessao virava COMPLETED, o que transformava
    //    qualquer toque de 1 segundo num treino contavel de 4 horas.
    //
    //    Usar a janela em vez de "tem de ser no mesmo dia" e de proposito: quem
    //    treina 23:30 e termina 00:30 atravessa a meia-noite legitimamente, e
    //    uma regra de mesmo-dia barraria justo esse caso. Vale pra todos,
    //    supervisor incluido -- sessao de tres dias nao existe pra ninguem.
    if (minutosEntre(inicioNovo, fimNovo) > AUTO_FECHAMENTO_MIN) {
      throw new BadRequestException(
        `O fim tem de estar dentro de ${AUTO_FECHAMENTO_MIN / 60}h do inicio do treino`,
      );
    }

    const duracaoBruta = minutosEntre(inicioNovo, fimNovo);

    // 4. A correcao pode REDUZIR a duracao a vontade, mas so pode AUMENTAR em
    //    ate AUMENTO_MAX_CORRECAO_MIN. Reduzir nao infla nada; aumentar e a
    //    unica direcao abusavel -- e a janela de 6h nao bastava, porque 4h cabe
    //    dentro dela e 4h e exatamente o teto de duracao contavel. Foi assim
    //    que um treino de 1 minuto virou 240 minutos contaveis em producao.
    //
    //    Comparado na duracao BRUTA, nao na classificada: senao esticar pra
    //    500 minutos passaria, porque `classificar` truncaria em 240.
    if (!ehSupervisor) {
      const aumento = duracaoBruta - baseParaAumento(sessao);
      if (aumento > AUMENTO_MAX_CORRECAO_MIN) {
        throw new BadRequestException(
          `A correcao pode aumentar o treino em no maximo ${AUMENTO_MAX_CORRECAO_MIN} min. Para mais que isso, peca a um supervisor.`,
        );
      }
    }

    // A correcao passa pelas MESMAS regras de duracao: senao seria o caminho
    // facil pra burlar a duracao minima e o teto.
    const { status, durationMin } = classificar(duracaoBruta);

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

      // A sessao acabou de gastar a correcao: nao e mais corrigivel pelo dono.
      return this.paraResposta(atualizada, true);
    });
  }

  /**
   * Registro de treino da Fase A: o que treinou, o quanto puxou e uma nota.
   *
   * Fica DE FORA da trava de correcao de proposito. A trava (uma correcao por
   * sessao, teto de +1h) existe porque horario decide o que conta: foi assim
   * que um treino de 1 minuto virou 240 min contaveis. Rotulo e nota nao
   * decidem streak, meta nem placar -- nao ha o que burlar, entao editar e
   * livre e quantas vezes quiser. Gastar a unica correcao da sessao pra
   * consertar um erro de digitacao seria punir o preenchimento, que e
   * exatamente o comportamento que se quer estimular nesta fase.
   */
  async anotar(
    autorId: string,
    sessionId: string,
    dados: RegistroEntrada,
    ehSupervisor = false,
  ) {
    const sessao = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.userId !== autorId && !ehSupervisor) {
      throw new ForbiddenException('Voce so pode anotar os seus treinos');
    }

    const registro = normalizarRegistro(dados);

    // Corpo vazio nao e erro: a tela pode salvar sem a pessoa ter mexido em
    // nada. So nao vale disparar uma escrita a toa.
    if (Object.keys(registro).length === 0) {
      return this.buscarParaResposta(sessionId);
    }

    await this.prisma.workoutSession.update({
      where: { id: sessao.id },
      data: registro,
    });

    return this.buscarParaResposta(sessionId);
  }

  /** Recarrega a sessao ja no formato que a tela espera, com o `corrigivel`. */
  private async buscarParaResposta(sessionId: string) {
    const atual = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { _count: { select: { corrections: true } } },
    });

    return this.paraResposta(atual, atual._count.corrections > 0);
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
