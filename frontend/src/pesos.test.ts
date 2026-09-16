import { describe, expect, it } from "vitest";
import {
  formatarPeso,
  formatarVolume,
  lerPeso,
  pesoParaCampo,
  resumoDasSeries,
  volumeEmKg,
} from "./pesos";

describe("lerPeso", () => {
  // O caso que morde em silencio: parseFloat("42,5") devolve 42, e o numero
  // salvo pareceria plausivel.
  it("le virgula como separador decimal", () => {
    expect(lerPeso("42,5")).toBe(42500);
  });

  it("le ponto tambem, porque teclado de celular varia", () => {
    expect(lerPeso("42.5")).toBe(42500);
  });

  it.each([
    ["40", 40000],
    ["1,25", 1250],
    ["7,75", 7750],
    ["0", 0],
    ["  40  ", 40000],
  ])("le %s como %s gramas", (texto, esperado) => {
    expect(lerPeso(texto)).toBe(esperado);
  });

  // Campo vazio e como se registra peso do corpo -- e diferente de invalido.
  it("campo vazio e peso do corpo, nao erro", () => {
    expect(lerPeso("")).toBeNull();
    expect(lerPeso("   ")).toBeNull();
  });

  it.each(["abc", "40kg", "-5", "4,5,5", "40,", ","])(
    "recusa %s",
    (texto) => {
      expect(lerPeso(texto)).toBeUndefined();
    },
  );

  it("recusa carga acima do teto", () => {
    expect(lerPeso("1001")).toBeUndefined();
    expect(lerPeso("1000")).toBe(1_000_000);
  });
});

describe("ida e volta", () => {
  it("o que foi digitado volta igual para o campo", () => {
    for (const texto of ["40", "42,5", "1,25", "7,75"]) {
      expect(pesoParaCampo(lerPeso(texto) as number)).toBe(texto);
    }
  });

  it("peso do corpo volta como campo vazio", () => {
    expect(pesoParaCampo(null)).toBe("");
  });
});

describe("formatarPeso", () => {
  it.each([
    [40000, "40 kg"],
    [42500, "42,5 kg"],
    [1250, "1,25 kg"],
    [null, "peso do corpo"],
  ])("formata %s como %s", (g, esperado) => {
    expect(formatarPeso(g as number | null)).toBe(esperado);
  });
});

describe("volume", () => {
  it("soma reps x carga, em kg", () => {
    const series = Array.from({ length: 4 }, () => ({ reps: 10, pesoG: 40000 }));

    expect(volumeEmKg(series)).toBe(1600);
  });

  // Mesma regra do servidor: inventar peso para o corpo seria pior que omitir.
  it("serie com peso do corpo nao entra", () => {
    expect(volumeEmKg([{ reps: 10, pesoG: null }])).toBe(0);
  });

  it("formata com separador de milhar", () => {
    expect(formatarVolume(1600)).toBe("1.600 kg");
  });
});

describe("resumoDasSeries", () => {
  it('abrevia series iguais como "4x10"', () => {
    const series = Array.from({ length: 4 }, () => ({ reps: 10, pesoG: 40000 }));

    expect(resumoDasSeries(series)).toBe("4x10 · 40 kg");
  });

  // A abreviacao so vale quando as series sao mesmo iguais; senao mentiria.
  it("nao abrevia quando as repeticoes variam", () => {
    expect(
      resumoDasSeries([
        { reps: 12, pesoG: 40000 },
        { reps: 10, pesoG: 40000 },
        { reps: 8, pesoG: 40000 },
      ]),
    ).toBe("12/10/8 · 40 kg");
  });

  it("mostra a menor carga com + quando a carga varia", () => {
    expect(
      resumoDasSeries([
        { reps: 10, pesoG: 40000 },
        { reps: 8, pesoG: 45000 },
      ]),
    ).toBe("10/8 · 40 kg+");
  });

  it("exercicio so com peso do corpo", () => {
    expect(resumoDasSeries([{ reps: 10, pesoG: null }])).toBe("1x10 · peso do corpo");
  });

  it("sem serie nenhuma", () => {
    expect(resumoDasSeries([])).toBe("sem serie");
  });
});
