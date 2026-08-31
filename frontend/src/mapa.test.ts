import { describe, expect, it } from "vitest";
import {
  construirColunas,
  descricaoDaCelula,
  nivelDaCelula,
  rotulosDeMes,
} from "./mapa";
import type { MapaDoAno } from "./types";

function mapa(over: Partial<MapaDoAno> = {}): MapaDoAno {
  return {
    inicio: "2026-08-24", // segunda
    fim: "2026-08-30", // domingo
    dias: [],
    total: { dias: 0, treinos: 0, minutos: 0 },
    ...over,
  };
}

describe("construirColunas", () => {
  it("uma semana vira uma coluna de sete dias, de segunda a domingo", () => {
    const colunas = construirColunas(mapa());

    expect(colunas).toHaveLength(1);
    expect(colunas[0].celulas.map((c) => c.dia)).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("preenche os dias que tiveram treino", () => {
    const colunas = construirColunas(
      mapa({ dias: [{ dia: "2026-08-26", treinos: 1, minutos: 55 }] }),
    );

    expect(colunas[0].celulas[2]).toMatchObject({ treinos: 1, minutos: 55 });
    expect(colunas[0].celulas[0].treinos).toBe(0);
  });

  it("varias semanas viram varias colunas", () => {
    const colunas = construirColunas(
      mapa({ inicio: "2026-08-03", fim: "2026-08-30" }),
    );

    expect(colunas).toHaveLength(4);
    expect(colunas.map((c) => c.inicio)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ]);
  });

  it("atravessa a virada de mes e de ano", () => {
    const colunas = construirColunas(
      mapa({ inicio: "2025-12-29", fim: "2026-01-04" }),
    );

    expect(colunas[0].celulas.map((c) => c.dia)).toContain("2026-01-01");
  });

  // Dia que ainda nao aconteceu nao pode parecer "dia sem treino".
  it("marca como futuro o que vem depois de hoje", () => {
    const colunas = construirColunas(mapa({ fim: "2026-08-26" })); // quarta

    const futuros = colunas[0].celulas.filter((c) => c.futuro).map((c) => c.dia);
    expect(futuros).toEqual(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]);
    expect(colunas[0].celulas[2].futuro).toBe(false);
  });

  it("a semana corrente sempre fecha com sete celulas", () => {
    const colunas = construirColunas(mapa({ fim: "2026-08-25" }));

    expect(colunas[0].celulas).toHaveLength(7);
  });
});

describe("nivelDaCelula", () => {
  const base = { dia: "2026-08-24", futuro: false };

  it("tres niveis: sem treino, um treino, mais de um", () => {
    expect(nivelDaCelula({ ...base, treinos: 0, minutos: 0 })).toBe(0);
    expect(nivelDaCelula({ ...base, treinos: 1, minutos: 60 })).toBe(1);
    expect(nivelDaCelula({ ...base, treinos: 2, minutos: 120 })).toBe(2);
    expect(nivelDaCelula({ ...base, treinos: 5, minutos: 300 })).toBe(2);
  });
});

describe("rotulosDeMes", () => {
  it("so rotula quando o mes vira", () => {
    const colunas = construirColunas(
      mapa({ inicio: "2026-08-24", fim: "2026-09-13" }),
    );

    // Colunas: 24/08, 31/08 (mesmo mes) e 07/09 (vira setembro).
    expect(rotulosDeMes(colunas)).toEqual(["ago", null, "set"]);
  });

  it("rotula a primeira coluna sempre", () => {
    const colunas = construirColunas(mapa());

    expect(rotulosDeMes(colunas)[0]).toBe("ago");
  });
});

describe("descricaoDaCelula", () => {
  const base = { dia: "2026-08-26", futuro: false };

  it("descreve o dia com treino", () => {
    expect(descricaoDaCelula({ ...base, treinos: 1, minutos: 55 })).toBe(
      "26/08: 1 treino, 55 min",
    );
  });

  it("usa plural quando ha mais de um", () => {
    expect(descricaoDaCelula({ ...base, treinos: 2, minutos: 90 })).toBe(
      "26/08: 2 treinos, 90 min",
    );
  });

  // Sem drama: "sem treino" e um fato, nao uma cobranca.
  it("dia vazio e so um fato", () => {
    expect(descricaoDaCelula({ ...base, treinos: 0, minutos: 0 })).toBe(
      "26/08: sem treino",
    );
  });
});
