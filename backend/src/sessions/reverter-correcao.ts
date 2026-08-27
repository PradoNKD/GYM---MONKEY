import { PrismaClient, SessionSource, SessionStatus } from '@prisma/client';
import { classificar } from './regras';
import { chaveDoDia, minutosEntre } from './tempo';

/**
 * Desfaz correções de uma sessão, devolvendo os horários que o **app** havia
 * gravado.
 *
 * Existe por causa de um caso real: até 2026-08-27 a correção deixava um usuário
 * comum esticar o fim do treino em até 4h, e uma sessão de 1 minuto virou 240
 * minutos contáveis em produção. A trava foi posta, mas ela impede correções
 * novas -- não desfaz a que já passou.
 *
 * O valor original não precisa ser adivinhado: a linha de `SessionCorrection`
 * guarda o `startedAtBefore` / `endedAtBefore` / `statusBefore`. É exatamente
 * para isto que a auditoria existe.
 *
 * A reversão **não apaga** as correções antigas e não faz UPDATE silencioso:
 * ela grava uma correção NOVA descrevendo o que foi desfeito. A trilha é
 * somente-append, então desfazer também tem de deixar rastro -- senão o
 * histórico passa a mentir na direção oposta.
 */

export interface EstadoDaSessao {
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number | null;
  status: SessionStatus;
  dayKey: string;
}

export interface SessaoCorrigida {
  sessionId: string;
  usuario: string;
  email: string;
  correcoes: number;
  atual: EstadoDaSessao;
  // Anulaveis porque no schema "nulo = campo nao mexido". Na pratica o
  // `corrigir()` grava os tres, mas a listagem so exibe -- quem se recusa a
  // adivinhar e a reversao.
  original: {
    startedAt: Date | null;
    endedAt: Date | null;
    status: SessionStatus | null;
  };
}

export interface RelatorioReversao {
  sessionId: string;
  usuario: string;
  correcoesDesfeitas: number;
  antes: EstadoDaSessao;
  depois: EstadoDaSessao;
  aplicado: boolean;
}

/** Motivo padrão gravado na correção de reversão. */
export const MOTIVO_REVERSAO =
  'Revertido para o horario que o app gravou (correcao feita antes da trava de aumento)';

/**
 * Toda sessão que tem pelo menos uma correção, com o valor atual e o original.
 * Serve para achar o que precisa ser revertido sem ter de ir ao SQL.
 */
export async function listarSessoesCorrigidas(
  prisma: PrismaClient,
): Promise<SessaoCorrigida[]> {
  const sessoes = await prisma.workoutSession.findMany({
    where: { corrections: { some: {} } },
    include: {
      user: { select: { name: true, email: true } },
      // A primeira correção é a que guarda o estado original: as seguintes
      // partem de um valor já corrigido.
      corrections: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
  });

  return sessoes.map((s) => ({
    sessionId: s.id,
    usuario: s.user.name,
    email: s.user.email,
    correcoes: s.corrections.length,
    atual: {
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMin: s.durationMin,
      status: s.status,
      dayKey: s.dayKey,
    },
    original: {
      startedAt: s.corrections[0].startedAtBefore,
      endedAt: s.corrections[0].endedAtBefore,
      status: s.corrections[0].statusBefore,
    },
  }));
}

/**
 * Recalcula duração e status a partir dos horários originais.
 *
 * `AUTO_CLOSED` não passa por `classificar` de propósito: aquele status foi
 * posto pelo auto-encerramento, e o número gravado é o teto de 6h, não uma
 * medida. Jogar 360 minutos em `classificar` devolveria `COMPLETED` com 240 --
 * ou seja, a reversão criaria um treino contável de 4h que nunca existiu.
 */
function recompor(
  inicio: Date,
  fim: Date,
  statusOriginal: SessionStatus,
): { durationMin: number; status: SessionStatus } {
  const bruta = minutosEntre(inicio, fim);

  if (statusOriginal === SessionStatus.AUTO_CLOSED) {
    return { durationMin: bruta, status: SessionStatus.AUTO_CLOSED };
  }

  return classificar(bruta);
}

/**
 * Reverte uma sessão para o horário original.
 *
 * Simula por padrão: só escreve com `aplicar: true`. Escrita em produção pede
 * confirmação explícita, como o backfill.
 */
export async function reverterCorrecao(
  prisma: PrismaClient,
  sessionId: string,
  opcoes: { aplicar?: boolean; autorId?: string | null; motivo?: string } = {},
): Promise<RelatorioReversao> {
  const sessao = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { name: true, timezone: true } },
      corrections: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!sessao) {
    throw new Error(`Sessao ${sessionId} nao encontrada`);
  }
  if (sessao.corrections.length === 0) {
    throw new Error(
      `Sessao ${sessionId} nunca foi corrigida -- nao ha o que reverter`,
    );
  }

  // No schema, os campos de antes/depois sao anulaveis ("nulo = campo nao
  // mexido"). Na pratica `corrigir()` grava os tres, porque recusa sessao em
  // andamento e sempre recalcula tudo. Se algum vier nulo, e dado inconsistente
  // -- e adivinhar um horario seria pior do que parar e avisar.
  const primeira = sessao.corrections[0];
  const inicio = primeira.startedAtBefore;
  const fim = primeira.endedAtBefore;
  const statusOriginal = primeira.statusBefore;

  if (!inicio || !fim || !statusOriginal) {
    const faltando = [
      !inicio && 'inicio',
      !fim && 'fim',
      !statusOriginal && 'status',
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Sessao ${sessionId}: a correcao nao guardou ${faltando} anterior, nao da pra reverter com seguranca`,
    );
  }

  const { durationMin, status } = recompor(inicio, fim, statusOriginal);

  const antes: EstadoDaSessao = {
    startedAt: sessao.startedAt,
    endedAt: sessao.endedAt,
    durationMin: sessao.durationMin,
    status: sessao.status,
    dayKey: sessao.dayKey,
  };

  const depois: EstadoDaSessao = {
    startedAt: inicio,
    endedAt: fim,
    durationMin,
    status,
    dayKey: chaveDoDia(inicio, sessao.user.timezone),
  };

  const relatorio: RelatorioReversao = {
    sessionId,
    usuario: sessao.user.name,
    correcoesDesfeitas: sessao.corrections.length,
    antes,
    depois,
    aplicado: false,
  };

  if (!opcoes.aplicar) return relatorio;

  await prisma.$transaction(async (tx) => {
    // A reversão é ela mesma uma correção: entra na trilha em vez de sumir com
    // o que aconteceu. As correções antigas ficam onde estão.
    await tx.sessionCorrection.create({
      data: {
        sessionId,
        authorId: opcoes.autorId ?? null,
        reason: opcoes.motivo ?? MOTIVO_REVERSAO,
        startedAtBefore: antes.startedAt,
        startedAtAfter: depois.startedAt,
        endedAtBefore: antes.endedAt,
        endedAtAfter: depois.endedAt,
        statusBefore: antes.status,
        statusAfter: depois.status,
      },
    });

    await tx.workoutSession.update({
      where: { id: sessionId },
      data: {
        startedAt: depois.startedAt,
        endedAt: depois.endedAt,
        durationMin: depois.durationMin,
        status: depois.status,
        dayKey: depois.dayKey,
        // Quem escreveu por último foi um script de manutenção, não o app nem
        // uma correção de usuário.
        source: SessionSource.SYSTEM,
      },
    });
  });

  return { ...relatorio, aplicado: true };
}
