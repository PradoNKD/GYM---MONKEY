import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GraficoProgressao } from "./GraficoProgressao";
import type { PontoDaProgressao, ProgressaoDeExercicio } from "./types";

const ponto = (
  dia: string,
  cargaMaxG: number | null,
  volumeG = 400_000,
  series = 1,
): PontoDaProgressao => ({ dia, cargaMaxG, volumeG, series });

function grafico(over: Partial<ProgressaoDeExercicio> = {}) {
  const progressao: ProgressaoDeExercicio = {
    exercicio: { id: "e1", nome: "Supino reto" },
    pontos: [ponto("2026-09-03", 40000), ponto("2026-09-10", 45000)],
    recorde: { dia: "2026-09-10", pesoG: 45000 },
    ...over,
  };
  const { container } = render(
    <GraficoProgressao progressao={progressao} onFechar={vi.fn()} />,
  );
  return container;
}

describe("GraficoProgressao", () => {
  it("o titulo nomeia a linha, entao nao ha legenda", () => {
    grafico();

    expect(screen.getByText("Supino reto")).toBeInTheDocument();
    expect(screen.getByText("Carga máxima por dia")).toBeInTheDocument();
  });

  it("desenha uma linha so", () => {
    const container = grafico();

    expect(container.querySelectorAll(".grafico-linha")).toHaveLength(1);
  });

  it("mostra o recorde com a data por extenso", () => {
    grafico();

    // Aparece duas vezes, e e o certo: na linha do recorde acima do grafico
    // e como rotulo direto no ponto em que aconteceu.
    expect(screen.getAllByText("45 kg")).toHaveLength(2);
    expect(screen.getByText(/10 de setembro de 2026/)).toBeInTheDocument();
  });

  // Numero em todo ponto viraria ruido e esconderia o que importa.
  it("rotula so o recorde, nao todos os pontos", () => {
    const container = grafico({
      pontos: [ponto("2026-09-01", 40000), ponto("2026-09-08", 42500), ponto("2026-09-15", 45000)],
      recorde: { dia: "2026-09-15", pesoG: 45000 },
    });

    expect(container.querySelectorAll(".grafico-rotulo")).toHaveLength(1);
  });

  // Em celular nao existe hover: o detalhe abre no TOQUE.
  it("tocar num ponto abre o detalhe do dia", async () => {
    const container = grafico();
    const alvos = container.querySelectorAll(".grafico-alvo");

    await userEvent.click(alvos[0]);

    expect(screen.getByText(/3 de setembro de 2026/)).toBeInTheDocument();
    expect(screen.getByText(/volume/)).toBeInTheDocument();
  });

  it("tocar de novo no mesmo ponto fecha o detalhe", async () => {
    const container = grafico();
    const alvo = container.querySelectorAll(".grafico-alvo")[0];

    await userEvent.click(alvo);
    await userEvent.click(alvo);

    expect(screen.queryByText(/3 de setembro de 2026/)).not.toBeInTheDocument();
  });

  it("o alvo de toque e bem maior que o ponto desenhado", () => {
    const container = grafico();
    const alvo = container.querySelector(".grafico-alvo")!;
    const desenhado = container.querySelector(".grafico-ponto")!;

    expect(Number(alvo.getAttribute("r"))).toBeGreaterThan(
      Number(desenhado.getAttribute("r")) * 2,
    );
  });

  // Ler o dado nao pode depender de enxergar a linha.
  it("tem tabela de numeros", async () => {
    grafico();

    await userEvent.click(screen.getByRole("button", { name: /Ver números/ }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Carga máx." })).toBeInTheDocument();
  });

  describe("variacao", () => {
    it("mostra o quanto subiu desde o comeco", () => {
      grafico();

      expect(screen.getByText(/\+5 kg desde o começo/)).toBeInTheDocument();
    });

    // Carga cai por motivo legitimo: deload, volta de lesao, faixa de reps.
    it("queda e informacao, nao fracasso", () => {
      grafico({
        pontos: [ponto("2026-09-03", 45000), ponto("2026-09-10", 40000)],
        recorde: { dia: "2026-09-03", pesoG: 45000 },
      });

      expect(screen.getByText(/5 kg a menos que no começo/)).toBeInTheDocument();
      expect(screen.queryByText(/caiu|piorou|atenção|cuidado/i)).not.toBeInTheDocument();
    });
  });

  describe("quando nao ha o que desenhar", () => {
    it("exercicio sem treino nenhum", () => {
      grafico({ pontos: [], recorde: null });

      expect(screen.getByText(/Ainda não há treino registrado/)).toBeInTheDocument();
    });

    it("exercicio so com peso do corpo diz por que nao ha linha", () => {
      grafico({ pontos: [ponto("2026-09-03", null)], recorde: null });

      expect(screen.getByText(/só tem série com o peso do corpo/)).toBeInTheDocument();
    });
  });
});
