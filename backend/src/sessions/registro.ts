import { WorkoutType } from '@prisma/client';

// Registro de treino, Fase A (v2.0).
//
// A Fase A e leve de proposito: rotulo do que treinou, esforco de 1 a 5 e uma
// nota curta. A Fase B (catalogo de exercicios, series, cargas, PRs) so se
// justifica se esta aqui mostrar adesao real -- e barato descobrir isso em dois
// dias em vez de em tres semanas.
//
// Nada deste arquivo entra em contagem nenhuma: rotulo nao decide streak, meta
// nem placar. E por isso que estes campos NAO passam pela trava de correcao
// (uma por sessao, teto de +1h) -- aquela existe porque horario decide o que
// conta, e aqui nao ha nada a burlar.

/** "Peito e triceps" e comum; "peito, costas, perna, ombro e braco" e ruido. */
export const MAX_TIPOS = 3;

export const ESFORCO_MIN = 1;
export const ESFORCO_MAX = 5;

/** Nota curta. Cabe "supino 4x10 com 40kg, agachamento 3x12" e nao vira diario. */
export const NOTA_MAX = 280;

/**
 * O que o cliente pode mandar. A distincao importa:
 * - campo ausente (`undefined`) = nao mexer
 * - campo `null` (ou vazio) = limpar
 *
 * Sem isso, salvar so o esforco apagaria a nota que a pessoa tinha escrito.
 */
export type RegistroEntrada = {
  workoutTypes?: WorkoutType[] | null;
  effort?: number | null;
  note?: string | null;
};

export type RegistroNormalizado = {
  workoutTypes?: WorkoutType[];
  effort?: number | null;
  note?: string | null;
};

/** Tira repetidos (mantendo a ordem de escolha) e corta no maximo. */
export function normalizarTipos(tipos: WorkoutType[]): WorkoutType[] {
  return [...new Set(tipos)].slice(0, MAX_TIPOS);
}

/** Espaco em branco nao e conteudo: vira nulo, e nao uma nota "vazia". */
export function normalizarNota(nota: string): string | null {
  const limpa = nota.trim();
  if (limpa === '') return null;

  return limpa.slice(0, NOTA_MAX);
}

export function esforcoValido(esforco: number): boolean {
  return (
    Number.isInteger(esforco) && esforco >= ESFORCO_MIN && esforco <= ESFORCO_MAX
  );
}

/**
 * Traduz o corpo do PATCH no que vai para o banco, respeitando
 * ausente = nao mexer e nulo = limpar.
 */
export function normalizarRegistro(entrada: RegistroEntrada): RegistroNormalizado {
  const saida: RegistroNormalizado = {};

  if (entrada.workoutTypes !== undefined) {
    saida.workoutTypes = entrada.workoutTypes ? normalizarTipos(entrada.workoutTypes) : [];
  }

  if (entrada.effort !== undefined) {
    saida.effort = entrada.effort === null ? null : entrada.effort;
  }

  if (entrada.note !== undefined) {
    saida.note = entrada.note === null ? null : normalizarNota(entrada.note);
  }

  return saida;
}

/** Se a pessoa registrou alguma coisa -- serve para medir adesao a Fase A. */
export function temRegistro(sessao: {
  workoutTypes: WorkoutType[];
  effort: number | null;
  note: string | null;
}): boolean {
  return sessao.workoutTypes.length > 0 || sessao.effort !== null || sessao.note !== null;
}
