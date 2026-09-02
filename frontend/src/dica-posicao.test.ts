import { describe, expect, it } from "vitest";
import { deslocamentoParaCaber, MARGEM_DA_BORDA } from "./dica-posicao";

const TELA = 390; // iPhone, largura logica

describe("deslocamentoParaCaber", () => {
  it("nao mexe na caixa que ja cabe", () => {
    expect(deslocamentoParaCaber({ left: 20, right: 280 }, TELA)).toBe(0);
  });

  it("puxa para a esquerda a caixa que passa da borda direita", () => {
    // Termina em 420 numa tela de 390: sobra 30 fora, mais 12 de margem.
    expect(deslocamentoParaCaber({ left: 160, right: 420 }, TELA)).toBe(-42);
  });

  it("empurra para a direita a caixa que passa da borda esquerda", () => {
    expect(deslocamentoParaCaber({ left: -60, right: 200 }, TELA)).toBe(72);
  });

  // Este e o caso que aconteceu de verdade no iPhone: `?` no meio da linha,
  // caixa aberta para a esquerda, texto cortado na borda.
  it("resolve o caso real: caixa larga comecando fora da tela", () => {
    const d = deslocamentoParaCaber({ left: -105, right: 155 }, TELA);

    expect(d).toBe(117);
    expect(-105 + d).toBe(MARGEM_DA_BORDA); // encostada na margem, dentro
  });

  it("caixa mais larga que a tela: prefere nao cortar o INICIO do texto", () => {
    // Sai pelos dois lados. Cortar o fim ainda deixa ler o comeco; cortar o
    // comeco nao deixa nem adivinhar o que dizia.
    const d = deslocamentoParaCaber({ left: -50, right: 450 }, TELA);

    expect(-50 + d).toBe(MARGEM_DA_BORDA);
  });

  it("respeita a margem exata nas duas bordas", () => {
    expect(deslocamentoParaCaber({ left: MARGEM_DA_BORDA, right: 300 }, TELA)).toBe(0);
    expect(
      deslocamentoParaCaber({ left: 100, right: TELA - MARGEM_DA_BORDA }, TELA),
    ).toBe(0);
  });

  it("aceita margem propria", () => {
    expect(deslocamentoParaCaber({ left: 4, right: 200 }, TELA, 24)).toBe(20);
  });

  it("funciona em tela larga (desktop) sem inventar deslocamento", () => {
    expect(deslocamentoParaCaber({ left: 600, right: 860 }, 1440)).toBe(0);
  });
});
