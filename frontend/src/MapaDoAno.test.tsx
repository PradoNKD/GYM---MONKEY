import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapaDoAno } from "./MapaDoAno";
import type { MapaDoAno as Mapa } from "./types";

function mapa(over: Partial<Mapa> = {}): Mapa {
  return {
    inicio: "2026-08-24",
    fim: "2026-08-30",
    dias: [],
    total: { dias: 0, treinos: 0, minutos: 0 },
    ...over,
  };
}

describe("MapaDoAno", () => {
  it("nao ocupa espaco enquanto o mapa nao chegou", () => {
    const { container } = render(<MapaDoAno mapa={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("desenha uma celula por dia da janela", () => {
    const { container } = render(<MapaDoAno mapa={mapa()} />);

    // 7 dias da grade + 3 da legenda.
    expect(container.querySelectorAll(".mapa-celula")).toHaveLength(10);
  });

  it("marca o dia treinado e descreve no title", () => {
    render(
      <MapaDoAno
        mapa={mapa({
          dias: [{ dia: "2026-08-26", treinos: 1, minutos: 55 }],
          total: { dias: 1, treinos: 1, minutos: 55 },
        })}
      />,
    );

    expect(screen.getByTitle("26/08: 1 treino, 55 min")).toBeInTheDocument();
  });

  // Restricao permanente do produto: a grade nao serve para cobrar.
  it("dia sem treino nao vira alerta, so fundo neutro", () => {
    const { container } = render(<MapaDoAno mapa={mapa()} />);

    const vazias = container.querySelectorAll(".mapa-celula--n0");
    expect(vazias.length).toBeGreaterThan(0);
    // Nenhuma classe de perigo/aviso na grade.
    expect(container.querySelector(".mapa-celula--perigo")).toBeNull();
    expect(screen.queryByText(/faltou|perdeu|voce nao/i)).not.toBeInTheDocument();
  });

  it("mostra o total de dias e o tempo somado", () => {
    render(
      <MapaDoAno
        mapa={mapa({
          dias: [{ dia: "2026-08-26", treinos: 1, minutos: 95 }],
          total: { dias: 1, treinos: 1, minutos: 95 },
        })}
      />,
    );

    expect(screen.getByText("1 dia · 1h 35min")).toBeInTheDocument();
  });

  it("dia que ainda nao aconteceu nao aparece como dia sem treino", () => {
    const { container } = render(<MapaDoAno mapa={mapa({ fim: "2026-08-26" })} />);

    // Quinta a domingo ainda nao aconteceram.
    expect(container.querySelectorAll(".mapa-celula--futuro")).toHaveLength(4);
  });
});
