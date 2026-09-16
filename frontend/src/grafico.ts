import type { PontoDaProgressao } from "./types";

/**
 * As contas do grafico de progressao, fora do componente para poderem ser
 * testadas sem montar tela.
 *
 * O grafico tem **uma serie so**: a carga maxima do dia. O volume aparece como
 * numero, e nao como segunda linha -- duas medidas de escalas diferentes no
 * mesmo desenho exigiriam dois eixos verticais, que e a forma mais comum de
 * mentir com grafico: a leitura de "cruzou" ou "descolou" vira artefato de
 * onde cada eixo foi ancorado.
 */

export const ALTURA = 120;
export const LARGURA = 320;
/** Espaco para os rotulos nao encostarem na borda. */
export const MARGEM = { topo: 14, direita: 10, baixo: 18, esquerda: 10 };

export type PontoNoGrafico = {
  ponto: PontoDaProgressao;
  x: number;
  y: number;
};

export type Escala = {
  pontos: PontoNoGrafico[];
  minG: number;
  maxG: number;
};

/**
 * Posiciona os pontos. So entram dias COM carga: dia de peso do corpo nao tem
 * onde ser desenhado num eixo de quilos, e inventar zero para ele afundaria a
 * linha num vale que nunca existiu.
 */
export function escalar(
  pontos: PontoDaProgressao[],
  largura = LARGURA,
  altura = ALTURA,
): Escala | null {
  const comCarga = pontos.filter((p) => p.cargaMaxG !== null);
  if (comCarga.length === 0) return null;

  const valores = comCarga.map((p) => p.cargaMaxG as number);
  const maxG = Math.max(...valores);
  const minG = Math.min(...valores);

  const util = {
    largura: largura - MARGEM.esquerda - MARGEM.direita,
    altura: altura - MARGEM.topo - MARGEM.baixo,
  };

  // Faixa zero (carga sempre igual) desenha reto no meio, em vez de dividir
  // por zero e sumir da tela.
  const faixa = maxG - minG || 1;

  return {
    minG,
    maxG,
    pontos: comCarga.map((ponto, i) => ({
      ponto,
      x:
        MARGEM.esquerda +
        (comCarga.length === 1
          ? util.largura / 2
          : (i / (comCarga.length - 1)) * util.largura),
      y:
        maxG === minG
          ? MARGEM.topo + util.altura / 2
          : MARGEM.topo + (1 - ((ponto.cargaMaxG as number) - minG) / faixa) * util.altura,
    })),
  };
}

/** O caminho da linha. Vazio quando ha menos de dois pontos para ligar. */
export function caminho(pontos: PontoNoGrafico[]): string {
  if (pontos.length < 2) return "";

  return pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** "2026-09-10" -> "10/09". Ano fica de fora: o eixo e curto. */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");

  return `${d}/${mes}`;
}

/** "2026-09-10" -> "10 de setembro de 2026", para leitor de tela e recorde. */
export function diaPorExtenso(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);

  return new Date(Date.UTC(ano, mes - 1, d)).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Quanto a carga andou entre o primeiro e o ultimo dia, em gramas.
 *
 * `null` quando nao ha o que comparar. Numero negativo e informacao, nao
 * fracasso -- carga cai por motivo legitimo (volta de lesao, deload, mudanca
 * de faixa de repeticao), e a tela nao trata isso como erro.
 */
export function variacao(pontos: PontoDaProgressao[]): number | null {
  const comCarga = pontos.filter((p) => p.cargaMaxG !== null);
  if (comCarga.length < 2) return null;

  const primeiro = comCarga[0].cargaMaxG as number;
  const ultimo = comCarga[comCarga.length - 1].cargaMaxG as number;

  return ultimo - primeiro;
}
