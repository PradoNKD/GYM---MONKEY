import { WeekStatus } from '@prisma/client';

// Meta semanal, streak de semanas e congelamento (v1.0).
//
// Por que semana e nao dia: streak diaria pune o descanso -- para nao perder a
// sequencia a pessoa treina todo dia, que e exatamente o contrario do que se
// quer. O limiar de formacao de habito medido e 4+ sessoes por semana durante
// 6 semanas (Kaushal & Rhodes, J Behav Med 2015), e a semana comporta folga.
//
// Este arquivo e so aritmetica: nao conhece Prisma nem HTTP. A maquina de
// estados fica testavel sem banco, e o servico so cuida de persistir.

/** Meta = dias distintos com treino contavel na semana. */
export const META_MIN = 3;
export const META_MAX = 6;
export const META_PADRAO = 3;

/** Congelamentos acumulaveis. Novo usuario ja comeca com o teto. */
export const TOKENS_MAX = 2;
export const TOKENS_INICIAIS = 2;
/** A cada N semanas CUMPRIDA seguidas, ganha +1 congelamento (ate o teto). */
export const SEMANAS_POR_TOKEN = 4;
/** Semanas seguidas sem nenhum treino que ativam o modo "recomeco". */
export const SEMANAS_DE_AUSENCIA = 4;

export type EstadoSemanal = {
  streakSemanas: number;
  tokens: number;
  /** Semanas CUMPRIDA seguidas -- so serve para ganhar congelamento. */
  cumpridasSeguidas: number;
  /**
   * Streak guardada pela ultima semana PERDIDA, para o reparo. Vale apenas
   * para a semana IMEDIATAMENTE seguinte: qualquer outro desfecho zera.
   */
  streakSalva: number | null;
  /** Semana (segunda, YYYY-MM-DD) do ultimo reparo -- um por trimestre. */
  ultimoReparoEm: string | null;
};

export const ESTADO_INICIAL: EstadoSemanal = {
  streakSemanas: 0,
  tokens: TOKENS_INICIAIS,
  cumpridasSeguidas: 0,
  streakSalva: null,
  ultimoReparoEm: null,
};

export type FechamentoSemana = {
  status: WeekStatus;
  meta: number;
  treinos: number;
  /** A semana restaurou uma streak perdida (exigiu meta + 1). */
  reparo: boolean;
  congelamentoUsado: boolean;
  streakAntes: number;
  streakDepois: number;
  tokensDepois: number;
  streakSalva: number | null;
  cumpridasSeguidas: number;
};

/** Trimestre civil de um dia (YYYY-MM-DD), para a cota de um reparo por trimestre. */
export function trimestreDe(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number);
  return `${ano}-T${Math.floor((mes - 1) / 3) + 1}`;
}

export function metaValida(meta: number): boolean {
  return Number.isInteger(meta) && meta >= META_MIN && meta <= META_MAX;
}

/**
 * Fecha UMA semana e devolve o novo estado. Funcao pura: mesmo estado + mesma
 * entrada = mesmo resultado, o que e o que torna o fechamento preguicoso
 * (lazy) seguro de repetir.
 */
export function fecharSemana(
  estado: EstadoSemanal,
  entrada: { semanaInicio: string; meta: number; treinos: number },
): { resultado: FechamentoSemana; estado: EstadoSemanal } {
  const { semanaInicio, meta, treinos } = entrada;
  const streakAntes = estado.streakSemanas;

  // --- Cumpriu a meta ---
  if (treinos >= meta) {
    // Reparo: depois de uma semana PERDIDA, fazer meta + 1 na semana seguinte
    // devolve a sequencia. Exige um treino a mais de proposito -- reparar tem
    // de custar algo, senao perder a semana nao tem consequencia nenhuma.
    // Um por trimestre, para nao virar rotina.
    const podeReparar =
      estado.streakSalva !== null &&
      estado.streakSalva > 0 &&
      treinos >= meta + 1 &&
      (estado.ultimoReparoEm === null ||
        trimestreDe(estado.ultimoReparoEm) !== trimestreDe(semanaInicio));

    const streakDepois = podeReparar ? estado.streakSalva! + 1 : streakAntes + 1;
    const cumpridasSeguidas = estado.cumpridasSeguidas + 1;
    const ganhouToken = cumpridasSeguidas % SEMANAS_POR_TOKEN === 0;
    const tokensDepois = ganhouToken
      ? Math.min(TOKENS_MAX, estado.tokens + 1)
      : estado.tokens;

    return {
      resultado: {
        status: WeekStatus.CUMPRIDA,
        meta,
        treinos,
        reparo: podeReparar,
        congelamentoUsado: false,
        streakAntes,
        streakDepois,
        tokensDepois,
        streakSalva: null,
        cumpridasSeguidas,
      },
      estado: {
        streakSemanas: streakDepois,
        tokens: tokensDepois,
        cumpridasSeguidas,
        streakSalva: null,
        ultimoReparoEm: podeReparar ? semanaInicio : estado.ultimoReparoEm,
      },
    };
  }

  // --- Nao cumpriu, mas tem congelamento ---
  //
  // So gasta congelamento se houver streak para proteger. Queimar um token
  // para "salvar" uma sequencia de zero seria consumir em silencio o recurso
  // de quem esta voltando -- e justamente quem mais vai precisar dele.
  if (estado.tokens > 0 && streakAntes > 0) {
    const tokensDepois = estado.tokens - 1;

    return {
      resultado: {
        status: WeekStatus.CONGELADA,
        meta,
        treinos,
        reparo: false,
        congelamentoUsado: true,
        streakAntes,
        // Congelada nao avanca a streak, e tambem nao zera.
        streakDepois: streakAntes,
        tokensDepois,
        streakSalva: null,
        cumpridasSeguidas: 0,
      },
      estado: {
        streakSemanas: streakAntes,
        tokens: tokensDepois,
        // Congelada quebra a corrida de CUMPRIDA que gera token novo.
        cumpridasSeguidas: 0,
        // A janela de reparo vale so para a semana seguinte a PERDIDA.
        streakSalva: null,
        ultimoReparoEm: estado.ultimoReparoEm,
      },
    };
  }

  // --- Perdeu ---
  return {
    resultado: {
      status: WeekStatus.PERDIDA,
      meta,
      treinos,
      reparo: false,
      congelamentoUsado: false,
      streakAntes,
      streakDepois: 0,
      tokensDepois: estado.tokens,
      // Guardada para o reparo. Zero nao vale a pena guardar.
      streakSalva: streakAntes > 0 ? streakAntes : null,
      cumpridasSeguidas: 0,
    },
    estado: {
      streakSemanas: 0,
      tokens: estado.tokens,
      cumpridasSeguidas: 0,
      streakSalva: streakAntes > 0 ? streakAntes : null,
      ultimoReparoEm: estado.ultimoReparoEm,
    },
  };
}
