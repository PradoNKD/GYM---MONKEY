import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Abas } from "./Abas";

describe("Abas", () => {
  it("mostra as tres abas, na ordem da barra", () => {
    render(<Abas ativa="hoje" onTrocar={() => {}} />);

    const nomes = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(nomes).toEqual(["Hoje", "Histórico", "Perfil"]);
  });

  it("marca a aba ativa para leitor de tela, nao so com cor", () => {
    render(<Abas ativa="historico" onTrocar={() => {}} />);

    expect(screen.getByRole("button", { name: "Histórico" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Hoje" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("avisa qual aba foi tocada", async () => {
    const onTrocar = vi.fn();
    render(<Abas ativa="hoje" onTrocar={onTrocar} />);

    await userEvent.click(screen.getByRole("button", { name: "Perfil" }));

    expect(onTrocar).toHaveBeenCalledWith("perfil");
  });

  it("tocar na aba que ja esta ativa nao e erro", async () => {
    // Acontece o tempo todo com o polegar; nao pode explodir nem virar no-op
    // silencioso que confunde quem le o codigo depois.
    const onTrocar = vi.fn();
    render(<Abas ativa="hoje" onTrocar={onTrocar} />);

    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));

    expect(onTrocar).toHaveBeenCalledWith("hoje");
  });

  it("a barra se anuncia como navegacao", () => {
    render(<Abas ativa="hoje" onTrocar={() => {}} />);

    expect(
      screen.getByRole("navigation", { name: "Navegacao principal" }),
    ).toBeInTheDocument();
  });

  it("o icone nao e lido pelo leitor de tela (o texto ja diz)", () => {
    const { container } = render(<Abas ativa="hoje" onTrocar={() => {}} />);

    const icones = container.querySelectorAll("svg");
    expect(icones.length).toBe(3);
    for (const icone of icones) {
      expect(icone).toHaveAttribute("aria-hidden", "true");
    }
  });
});
