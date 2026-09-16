/**
 * Exercicios, series e progressao -- as regras, sem Prisma e sem HTTP.
 *
 * **A decisao central: o catalogo se constroi sozinho.** Nao existe lista
 * curada de exercicios. A pessoa digita o nome e ele vira sugestao para sempre,
 * vindo do proprio historico. Lista fixa teria o problema de "meu exercicio nao
 * esta aqui"; texto livre puro fragmentaria o dado -- "supino reto", "Supino
 * Reto" e "supino  reto" virariam tres exercicios e o grafico morreria.
 * Escolher do que ja existe da liberdade e consistencia ao mesmo tempo.
 *
 * Por isso `normalizar` e a peca mais importante deste arquivo: e ela que
 * decide se dois nomes sao o mesmo exercicio.
 */

export const NOME_MAX = 60;
export const REPS_MIN = 1;
export const REPS_MAX = 200;
/** 1000 kg em gramas. Teto de sanidade, nao de ambicao. */
export const PESO_MAX_G = 1_000_000;
export const SERIES_MAX_POR_EXERCICIO = 20;

/**
 * Peso em GRAMAS, inteiro -- nunca float.
 *
 * Carga de academia anda de 1,25 em 1,25 kg, entao o campo precisa de casa
 * decimal. Guardar 42.5 como float funcionaria na maior parte do tempo e
 * devolveria 42.49999999 em algum lugar, provavelmente num recorde. Inteiro em
 * gramas torna comparacao e soma exatas, e custa uma funcao de formatacao.
 */
export function kgParaGramas(kg: number): number {
  return Math.round(kg * 1000);
}

export function gramasParaKg(g: number): number {
  return g / 1000;
}

/** "42,5 kg" / "40 kg" / "peso do corpo" quando nao ha carga. */
export function formatarPeso(g: number | null): string {
  if (g === null) return 'peso do corpo';

  const kg = gramasParaKg(g);
  const texto = Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/0+$/, '');

  return `${texto.replace('.', ',')} kg`;
}

/**
 * A chave que diz se dois nomes sao o mesmo exercicio.
 *
 * Tira acento, caixa e espaco repetido. Acento sai porque ninguem digita
 * "triceps" com acento na academia, com a mao suada, e "Tríceps" e "triceps"
 * precisam ser a mesma linha do grafico.
 */
export function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devolve o nome limpo para exibir, ou `null` se nao sobrou nome nenhum. */
export function limparNome(nome: string): string | null {
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);

  return limpo.length > 0 ? limpo : null;
}

export type Serie = {
  reps: number;
  /** Gramas, ou `null` para exercicio com o peso do corpo. */
  pesoG: number | null;
};

/**
 * Volume = soma de reps x carga, em gramas.
 *
 * Serie sem carga (peso do corpo) **nao entra no volume**: contar como zero
 * seria mentira menor que inventar um peso, e o numero segue honesto porque a
 * tela diz que e volume levantado.
 */
export function volume(series: Serie[]): number {
  return series.reduce((total, s) => total + (s.pesoG ?? 0) * s.reps, 0);
}

/** A maior carga entre as series. `null` quando nenhuma teve carga. */
export function cargaMaxima(series: Serie[]): number | null {
  const comCarga = series.filter((s) => s.pesoG !== null).map((s) => s.pesoG as number);

  return comCarga.length > 0 ? Math.max(...comCarga) : null;
}

export type SerieDeUmDia = Serie & { dia: string };

export type PontoDaProgressao = {
  dia: string;
  cargaMaxG: number | null;
  volumeG: number;
  series: number;
};

/**
 * Os pontos do grafico: um por DIA, em ordem.
 *
 * Um dia, e nao uma sessao, porque a meta semanal ja conta dias distintos (ver
 * `semanas.service`) e porque duas sessoes no mesmo dia sao o mesmo treino
 * partido em dois -- somar o volume e pegar a maior carga e a leitura certa.
 */
export function progressao(series: SerieDeUmDia[]): PontoDaProgressao[] {
  const porDia = new Map<string, Serie[]>();

  for (const s of series) {
    const lista = porDia.get(s.dia) ?? [];
    lista.push({ reps: s.reps, pesoG: s.pesoG });
    porDia.set(s.dia, lista);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, doDia]) => ({
      dia,
      cargaMaxG: cargaMaxima(doDia),
      volumeG: volume(doDia),
      series: doDia.length,
    }));
}

/**
 * O recorde de carga e o dia em que aconteceu.
 *
 * Empate fica com a data MAIS ANTIGA de proposito: o recorde e de quando foi
 * batido, e repetir a mesma carga depois nao o bate de novo. E a mesma regra
 * dos recordes das conquistas, onde so a superacao comemora.
 */
export function recorde(pontos: PontoDaProgressao[]): { dia: string; pesoG: number } | null {
  let melhor: { dia: string; pesoG: number } | null = null;

  for (const p of pontos) {
    if (p.cargaMaxG === null) continue;
    if (melhor === null || p.cargaMaxG > melhor.pesoG) {
      melhor = { dia: p.dia, pesoG: p.cargaMaxG };
    }
  }

  return melhor;
}
