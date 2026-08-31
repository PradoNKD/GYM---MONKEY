import type { MapaDoAno } from "./types";

// Monta as colunas da grade do ano. Puro, sem React: a aritmetica de calendario
// e onde mora o erro, entao ela fica testavel sozinha.

export type CelulaDoMapa = {
  /** YYYY-MM-DD. */
  dia: string;
  treinos: number;
  minutos: number;
  /** Depois de hoje: renderiza vazio, sem contar como "dia sem treino". */
  futuro: boolean;
};

/** Uma coluna = uma semana, de segunda (0) a domingo (6). */
export type ColunaDoMapa = { inicio: string; celulas: CelulaDoMapa[] };

export const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function somarDias(chave: string, dias: number): string {
  const [ano, mes, dia] = chave.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return data.toISOString().slice(0, 10);
}

export function construirColunas(mapa: MapaDoAno): ColunaDoMapa[] {
  // Indexa os dias que tiveram treino: o resto e fundo.
  const porDia = new Map(mapa.dias.map((d) => [d.dia, d]));

  const colunas: ColunaDoMapa[] = [];
  let cursor = mapa.inicio;

  // `inicio` ja vem numa segunda-feira do servidor, entao cada volta e uma
  // coluna fechada.
  while (cursor <= mapa.fim) {
    const celulas: CelulaDoMapa[] = [];

    for (let i = 0; i < 7; i++) {
      const dia = somarDias(cursor, i);
      const encontrado = porDia.get(dia);

      celulas.push({
        dia,
        treinos: encontrado?.treinos ?? 0,
        minutos: encontrado?.minutos ?? 0,
        futuro: dia > mapa.fim,
      });
    }

    colunas.push({ inicio: cursor, celulas });
    cursor = somarDias(cursor, 7);
  }

  return colunas;
}

/**
 * Intensidade da celula. Tres niveis so: um degrade fino sugeriria uma
 * quantidade que o dado nao tem -- quase todo dia treinado tem exatamente um
 * treino.
 */
export function nivelDaCelula(celula: CelulaDoMapa): 0 | 1 | 2 {
  if (celula.treinos === 0) return 0;
  return celula.treinos === 1 ? 1 : 2;
}

/**
 * Rotulo de mes por coluna, preenchido so quando o mes VIRA -- repetir "ago"
 * em cima de cada coluna seria ruido.
 */
export function rotulosDeMes(colunas: ColunaDoMapa[]): (string | null)[] {
  let ultimo = "";

  return colunas.map((coluna) => {
    const mes = coluna.inicio.slice(0, 7);
    if (mes === ultimo) return null;
    ultimo = mes;

    return MESES[Number(coluna.inicio.slice(5, 7)) - 1];
  });
}

/** Texto do title/aria de uma celula. */
export function descricaoDaCelula(celula: CelulaDoMapa): string {
  const [, mes, dia] = celula.dia.split("-");
  const data = `${dia}/${mes}`;

  if (celula.treinos === 0) return `${data}: sem treino`;

  const treinos = celula.treinos === 1 ? "1 treino" : `${celula.treinos} treinos`;
  return `${data}: ${treinos}, ${celula.minutos} min`;
}
