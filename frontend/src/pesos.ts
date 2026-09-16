/**
 * Carga: o que a pessoa digita <-> o que o servidor guarda.
 *
 * O servidor guarda **gramas, inteiro**, nunca float: carga anda de 1,25 em
 * 1,25 kg, e guardar 42.5 como float devolveria 42.49999999 em algum lugar --
 * provavelmente num recorde. Aqui fica a traducao dos dois lados.
 *
 * O caso que morde em silencio: **em portugues se digita `42,5`**, e
 * `parseFloat("42,5")` devolve `42`. Sem tratar a virgula, a fracao some sem
 * erro nenhum -- o pior tipo de bug, porque o numero salvo parece plausivel.
 */

/** 1000 kg. Mesmo teto do servidor; passar disso e erro de digitacao. */
export const PESO_MAX_G = 1_000_000;

/**
 * Le o que foi digitado. Aceita virgula e ponto, e devolve `null` quando o
 * campo esta vazio -- que e como se registra **peso do corpo**.
 *
 * Devolve `undefined` para entrada invalida, para a tela poder distinguir
 * "deixou em branco de proposito" de "digitou qualquer coisa".
 */
export function lerPeso(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === "") return null;

  // Virgula e ponto significam a mesma coisa para quem digita.
  const normalizado = limpo.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return undefined;

  const kg = Number(normalizado);
  if (!Number.isFinite(kg)) return undefined;

  const gramas = Math.round(kg * 1000);
  if (gramas > PESO_MAX_G) return undefined;

  return gramas;
}

/** Para dentro do campo de texto: "42,5" -- o formato em que se digita. */
export function pesoParaCampo(gramas: number | null): string {
  if (gramas === null) return "";

  const kg = gramas / 1000;

  return String(kg).replace(".", ",");
}

/** Para leitura na tela: "42,5 kg" ou "peso do corpo". */
export function formatarPeso(gramas: number | null): string {
  if (gramas === null) return "peso do corpo";

  return `${pesoParaCampo(gramas)} kg`;
}

/**
 * Volume em kg, para a tela. Serie sem carga **nao entra** -- e a mesma regra
 * do servidor: inventar um peso para o corpo seria pior que omitir.
 */
export function volumeEmKg(series: { reps: number; pesoG: number | null }[]): number {
  const gramas = series.reduce((t, s) => t + (s.pesoG ?? 0) * s.reps, 0);

  return gramas / 1000;
}

/** "1.700 kg" -- volume fica grande rapido, entao separador de milhar ajuda. */
export function formatarVolume(kg: number): string {
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
}

/** Resumo curto de um exercicio no treino: "4x10 · 40 kg". */
export function resumoDasSeries(
  series: { reps: number; pesoG: number | null }[],
): string {
  if (series.length === 0) return "sem serie";

  const reps = series.map((s) => s.reps);
  const pesos = series.map((s) => s.pesoG);

  const mesmasReps = reps.every((r) => r === reps[0]);
  const mesmoPeso = pesos.every((p) => p === pesos[0]);

  // "4x10" so quando as series sao mesmo iguais; senao a abreviacao mentiria.
  const parteReps = mesmasReps
    ? `${series.length}x${reps[0]}`
    : reps.join("/");

  const partePeso = mesmoPeso
    ? formatarPeso(pesos[0])
    : `${formatarPeso(Math.min(...(pesos.filter((p) => p !== null) as number[])))}+`;

  return `${parteReps} · ${partePeso}`;
}
