import { inicioDaSemana, somarDias } from './tempo';

// Mapa do ano (v1.0): a grade de dias treinados.
//
// A decisao que importa aqui nao e tecnica. Um ano inteiro de quadradinhos
// vazios, para quem comecou faz um mes, le como fracasso -- e este produto tem
// regra explicita contra qualquer coisa que envergonhe. Por isso a janela
// COMECA no primeiro treino da pessoa, e nao em 1o de janeiro: ninguem precisa
// olhar para meses em que simplesmente nao existia por aqui.

/** Teto da janela. Acima de um ano a grade fica ilegivel em celular. */
export const MAX_SEMANAS_MAPA = 52;

/**
 * Janela exibida, alinhada em semanas (o inicio e sempre uma segunda, para as
 * colunas da grade fecharem).
 *
 * `fim` e HOJE, nao o domingo da semana corrente: dia que ainda nao aconteceu
 * nao e "dia sem treino".
 */
export function janelaDoMapa(
  primeiroDia: string | null,
  hoje: string,
  maxSemanas = MAX_SEMANAS_MAPA,
): { inicio: string; fim: string } {
  // A semana mais antiga que a janela aceita mostrar.
  const limite = inicioDaSemana(somarDias(hoje, -7 * (maxSemanas - 1)));

  if (!primeiroDia) {
    // Quem nunca treinou ve so a semana corrente, e nao um ano de vazio.
    return { inicio: inicioDaSemana(hoje), fim: hoje };
  }

  const primeiraSemana = inicioDaSemana(primeiroDia);

  return {
    inicio: primeiraSemana > limite ? primeiraSemana : limite,
    fim: hoje,
  };
}
