import { SessionStatus } from '@prisma/client';

// Regras de integridade da sessao (v0.9). Sem esta camada, qualquer placar
// premia quem toca no botao duas vezes: hoje da pra abrir e fechar treinos de
// 1 segundo e inflar o contador da semana.

/** Abaixo disso a sessao entra no historico, mas nao conta pra nada. */
export const DURACAO_MIN_MIN = 20;
/** Acima disso os minutos sao truncados -- protege quem esqueceu o check-out. */
export const DURACAO_MAX_MIN = 4 * 60;
/** Sessao aberta por mais tempo que isso e encerrada pelo sistema. */
export const AUTO_FECHAMENTO_MIN = 6 * 60;
/** Intervalo obrigatorio entre o fim de um treino e o inicio do proximo. */
export const COOLDOWN_MIN = 30;

export type Classificacao = { status: SessionStatus; durationMin: number };

// Traduz a duracao bruta em status + minutos gravados.
export function classificar(duracaoBrutaMin: number): Classificacao {
  const duracao = Math.max(0, duracaoBrutaMin);

  if (duracao < DURACAO_MIN_MIN) {
    // Sessao curta: guarda a duracao real, mas nao e contabil.
    return { status: SessionStatus.SHORT, durationMin: duracao };
  }

  if (duracao > DURACAO_MAX_MIN) {
    // Continua valendo como 1 treino; so os minutos sao limitados.
    return { status: SessionStatus.COMPLETED, durationMin: DURACAO_MAX_MIN };
  }

  return { status: SessionStatus.COMPLETED, durationMin: duracao };
}

// Só COMPLETED conta pra meta, streak e placar. SHORT e AUTO_CLOSED ficam no
// historico como registro, mas fora de qualquer contagem.
export function ehContabil(status: SessionStatus): boolean {
  return status === SessionStatus.COMPLETED;
}

// Quanto falta de cooldown, em minutos (0 = pode abrir).
export function cooldownRestante(ultimoFim: Date | null, agora: Date): number {
  if (!ultimoFim) return 0;

  const passados = Math.floor((agora.getTime() - ultimoFim.getTime()) / 60000);
  return Math.max(0, COOLDOWN_MIN - passados);
}
