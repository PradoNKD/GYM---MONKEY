import { PrismaClient, SessionSource, SessionStatus, TimeEntryType } from '@prisma/client';
import { AUTO_FECHAMENTO_MIN, classificar } from './regras';
import { chaveDoDia, minutosEntre } from './tempo';

// Converte o historico antigo (TimeEntry, dois registros soltos) em sessoes.
//
// Os TimeEntry NAO sao apagados: continuam valendo como auditoria da epoca
// anterior as sessoes. O que fazemos aqui e derivar as sessoes a partir deles.
//
// Fica fora da migration de proposito: o pareamento e o dayKey no fuso certo
// pedem teste, e SQL puro numa migration nao se testa bem. O custo e ter de
// rodar a mao em producao, como o set-role.

export type RelatorioBackfill = {
  usuariosProcessados: number;
  usuariosPulados: number;
  sessoesCriadas: number;
  autoFechadas: number;
  checkOutsOrfaos: number;
};

type Prisma = Pick<PrismaClient, 'user' | 'timeEntry' | 'membership' | 'workoutSession'>;

export type OpcoesBackfill = {
  /** Limita a conversao a estes usuarios. Sem isso, converte todo mundo. */
  userIds?: string[];
};

export async function converterTimeEntriesEmSessoes(
  prisma: Prisma,
  opcoes: OpcoesBackfill = {},
): Promise<RelatorioBackfill> {
  const relatorio: RelatorioBackfill = {
    usuariosProcessados: 0,
    usuariosPulados: 0,
    sessoesCriadas: 0,
    autoFechadas: 0,
    checkOutsOrfaos: 0,
  };

  const usuarios = await prisma.user.findMany({
    where: opcoes.userIds ? { id: { in: opcoes.userIds } } : undefined,
    select: { id: true, timezone: true },
  });

  for (const usuario of usuarios) {
    // Idempotencia: se o usuario ja tem sessao vinda de backfill, nao repete.
    // Rodar duas vezes nao pode duplicar o historico de ninguem.
    const jaConvertido = await prisma.workoutSession.findFirst({
      where: { userId: usuario.id, source: SessionSource.BACKFILL },
      select: { id: true },
    });
    if (jaConvertido) {
      relatorio.usuariosPulados++;
      continue;
    }

    const registros = await prisma.timeEntry.findMany({
      where: { userId: usuario.id },
      orderBy: { timestamp: 'asc' },
    });
    if (registros.length === 0) continue;

    const vinculo = await prisma.membership.findFirst({
      where: { userId: usuario.id },
      select: { groupId: true },
      orderBy: { createdAt: 'asc' },
    });
    const groupId = vinculo?.groupId ?? null;

    // Pareia CHECK_IN com o CHECK_OUT seguinte. Um CHECK_IN sem fecho (porque
    // veio outro CHECK_IN, ou porque a lista acabou) e tratado como sessao
    // esquecida: fecha no limite de 6h e nao conta -- a mesma regra do runtime.
    let aberto: (typeof registros)[number] | null = null;

    const gravar = async (
      inicio: Date,
      fim: Date,
      status: SessionStatus,
      durationMin: number,
    ) => {
      await prisma.workoutSession.create({
        data: {
          userId: usuario.id,
          groupId,
          startedAt: inicio,
          endedAt: fim,
          durationMin,
          status,
          source: SessionSource.BACKFILL,
          dayKey: chaveDoDia(inicio, usuario.timezone),
        },
      });
      relatorio.sessoesCriadas++;
      if (status === SessionStatus.AUTO_CLOSED) relatorio.autoFechadas++;
    };

    const fecharEsquecido = async (inicio: Date) => {
      const fim = new Date(inicio.getTime() + AUTO_FECHAMENTO_MIN * 60000);
      await gravar(inicio, fim, SessionStatus.AUTO_CLOSED, AUTO_FECHAMENTO_MIN);
    };

    for (const registro of registros) {
      if (registro.type === TimeEntryType.CHECK_IN) {
        if (aberto) await fecharEsquecido(aberto.timestamp);
        aberto = registro;
        continue;
      }

      // CHECK_OUT
      if (!aberto) {
        relatorio.checkOutsOrfaos++;
        continue;
      }

      const { status, durationMin } = classificar(
        minutosEntre(aberto.timestamp, registro.timestamp),
      );
      await gravar(aberto.timestamp, registro.timestamp, status, durationMin);
      aberto = null;
    }

    // Sobrou um CHECK_IN sem fecho no fim da lista.
    if (aberto) await fecharEsquecido(aberto.timestamp);

    relatorio.usuariosProcessados++;
  }

  return relatorio;
}
