import type { TipoTreino } from "./types";

// Rotulos de exibicao do registro de treino (Fase A).
//
// Ficam fora do componente porque o historico tambem os usa para LER, e porque
// misturar constantes com componentes num arquivo so quebra o fast refresh do
// React em desenvolvimento.

export const ROTULO_DO_TIPO: Record<TipoTreino, string> = {
  PEITO: "Peito",
  COSTAS: "Costas",
  PERNAS: "Pernas",
  OMBROS: "Ombros",
  BRACOS: "Braços",
  ABDOMEN: "Abdômen",
  CARDIO: "Cardio",
  CORPO_INTEIRO: "Corpo inteiro",
  OUTRO: "Outro",
};

/** A ordem em que os chips aparecem na tela. */
export const TIPOS: TipoTreino[] = [
  "PEITO",
  "COSTAS",
  "PERNAS",
  "OMBROS",
  "BRACOS",
  "ABDOMEN",
  "CARDIO",
  "CORPO_INTEIRO",
  "OUTRO",
];

/**
 * Esforco percebido. E percepcao de treino, nao medida clinica -- dado de saude
 * esta fora do produto (LGPD art. 11).
 */
export const ROTULO_DO_ESFORCO: Record<number, string> = {
  1: "Muito leve",
  2: "Leve",
  3: "Moderado",
  4: "Puxado",
  5: "Máximo",
};

export interface LimitesDoRegistro {
  tiposMax: number;
  esforcoMin: number;
  esforcoMax: number;
  notaMax: number;
}
