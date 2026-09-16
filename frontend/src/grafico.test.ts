import { describe, expect, it } from "vitest";
import {
  ALTURA,
  LARGURA,
  MARGEM,
  caminho,
  diaCurto,
  diaPorExtenso,
  escalar,
  variacao,
} from "./grafico";
import type { PontoDaProgressao } from "./types";

const p = (
  dia: string,
  cargaMaxG: number | null,
  volumeG = 0,
  series = 1,
): PontoDaProgressao => ({ dia, cargaMaxG, volumeG, series });

describe("escalar", () => {
  it("o maior valor fica no topo e o menor embaixo", () => {
    const e = escalar([p("2026-09-03", 40000), p("2026-09-10", 50000)])!;

    expect(e.minG).toBe(40000);
    expect(e.maxG).toBe(50000);
    // y menor = mais alto na tela.
    expect(e.pontos[1].y).toBeLessThan(e.pontos[0].y);
    expect(e.pontos[1].y).toBe(MARGEM.topo);
  });

  it("espalha os pontos da esquerda para a direita", () => {
    const e = escalar([p("a", 10000), p("b", 20000), p("c", 30000)])!;

    expect(e.pontos[0].x).toBe(MARGEM.esquerda);
    expect(e.pontos[2].x).toBe(LARGURA - MARGEM.direita);
    expect(e.pontos[1].x).toBeGreaterThan(e.pontos[0].x);
    expect(e.pontos[1].x).toBeLessThan(e.pontos[2].x);
  });

  it("tudo dentro da area desenhavel", () => {
    const e = escalar([p("a", 10000), p("b", 90000), p("c", 50000)])!;

    for (const ponto of e.pontos) {
      expect(ponto.x).toBeGreaterThanOrEqual(MARGEM.esquerda);
      expect(ponto.x).toBeLessThanOrEqual(LARGURA - MARGEM.direita);
      expect(ponto.y).toBeGreaterThanOrEqual(MARGEM.topo);
      expect(ponto.y).toBeLessThanOrEqual(ALTURA - MARGEM.baixo);
    }
  });

  // Carga sempre igual dividiria por zero e sumiria da tela.
  it("carga que nao mudou desenha reto no meio", () => {
    const e = escalar([p("a", 40000), p("b", 40000)])!;

    expect(e.pontos[0].y).toBe(e.pontos[1].y);
    expect(Number.isFinite(e.pontos[0].y)).toBe(true);
  });

  it("um ponto so fica centralizado", () => {
    const e = escalar([p("a", 40000)])!;

    expect(e.pontos).toHaveLength(1);
    expect(e.pontos[0].x).toBe(LARGURA / 2);
  });

  // Inventar zero para peso do corpo afundaria a linha num vale que nao existiu.
  it("dia so de peso do corpo fica fora do desenho", () => {
    const e = escalar([p("a", 40000), p("b", null), p("c", 45000)])!;

    expect(e.pontos.map((x) => x.ponto.dia)).toEqual(["a", "c"]);
  });

  it("exercicio so de peso do corpo nao tem grafico", () => {
    expect(escalar([p("a", null), p("b", null)])).toBeNull();
  });

  it("sem ponto nenhum nao tem grafico", () => {
    expect(escalar([])).toBeNull();
  });
});

describe("caminho", () => {
  it("liga os pontos em ordem", () => {
    const e = escalar([p("a", 10000), p("b", 20000)])!;
    const d = caminho(e.pontos);

    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
  });

  it("um ponto so nao vira linha", () => {
    const e = escalar([p("a", 10000)])!;

    expect(caminho(e.pontos)).toBe("");
  });
});

describe("datas", () => {
  it("diaCurto e dia/mes, sem ano", () => {
    expect(diaCurto("2026-09-10")).toBe("10/09");
  });

  it("diaPorExtenso nao escorrega de fuso", () => {
    // O bug classico: new Date("2026-09-10") em fuso negativo vira dia 9.
    expect(diaPorExtenso("2026-09-10")).toBe("10 de setembro de 2026");
    expect(diaPorExtenso("2026-01-01")).toBe("1 de janeiro de 2026");
  });
});

describe("variacao", () => {
  it("compara o ultimo com o primeiro", () => {
    expect(variacao([p("a", 40000), p("b", 50000)])).toBe(10000);
  });

  // Carga cai por motivo legitimo: volta de lesao, deload, mudanca de faixa.
  it("queda e numero negativo, nao erro", () => {
    expect(variacao([p("a", 50000), p("b", 40000)])).toBe(-10000);
  });

  it("um ponto so nao tem com o que comparar", () => {
    expect(variacao([p("a", 40000)])).toBeNull();
    expect(variacao([])).toBeNull();
  });

  it("ignora os dias de peso do corpo nas pontas", () => {
    expect(variacao([p("z", null), p("a", 40000), p("b", 45000)])).toBe(5000);
  });
});
