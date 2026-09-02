import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dica } from "./Dica";

describe("Dica", () => {
  it("comeca fechada: nao ocupa a tela antes de ser pedida", () => {
    render(<Dica texto="Explicacao" />);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "O que isso significa?" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("abre no TOQUE, nao no hover (em celular nao existe hover)", async () => {
    render(<Dica texto="Congelamento protege a sequencia" />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Congelamento protege a sequencia",
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("tocar de novo fecha", async () => {
    render(<Dica texto="Explicacao" />);

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tocar fora fecha", async () => {
    render(
      <div>
        <Dica texto="Explicacao" />
        <button type="button">Outra coisa</button>
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "O que isso significa?" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Outra coisa" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("Escape fecha (teclado tambem tem de sair)", async () => {
    render(<Dica texto="Explicacao" />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("duas dicas na tela nao ficam abertas juntas", async () => {
    // Sem isto a tela vira um monte de caixas empilhadas. Cada dica fecha
    // sozinha ao detectar toque fora dela -- sem estado compartilhado.
    render(
      <div>
        <Dica texto="Primeira" rotulo="Dica um" />
        <Dica texto="Segunda" rotulo="Dica dois" />
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dica um" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Primeira");

    await userEvent.click(screen.getByRole("button", { name: "Dica dois" }));

    const abertas = screen.getAllByRole("tooltip");
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toHaveTextContent("Segunda");
  });

  it("liga o botao ao texto para leitor de tela", async () => {
    render(<Dica texto="Explicacao" />);
    const botao = screen.getByRole("button");

    expect(botao).not.toHaveAttribute("aria-describedby");

    await userEvent.click(botao);

    const idDoTexto = screen.getByRole("tooltip").getAttribute("id");
    expect(idDoTexto).toBeTruthy();
    expect(botao).toHaveAttribute("aria-describedby", idDoTexto!);
  });

  it("o icone nao e lido: quem le tela ja recebe o rotulo do botao", () => {
    const { container } = render(<Dica texto="Explicacao" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
