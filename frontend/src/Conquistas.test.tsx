import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConviteDeRecomeco,
  FestaDeConquistas,
  ResumoConquistas,
} from "./Conquistas";
import type { ConquistaNova } from "./types";

function marco(over: Partial<ConquistaNova> = {}): ConquistaNova {
  return {
    code: "PRIMEIRO_TREINO",
    kind: "MARCO",
    nome: "Primeiro treino",
    descricao: "O começo, que é a parte mais difícil.",
    unidade: null,
    valor: null,
    em: "2026-08-31T12:00:00.000Z",
    ...over,
  };
}

describe("FestaDeConquistas", () => {
  it("nao ocupa espaco quando nao ha nada a comemorar", () => {
    const { container } = render(
      <FestaDeConquistas novas={[]} onFechar={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o marco com nome e descricao", () => {
    render(<FestaDeConquistas novas={[marco()]} onFechar={vi.fn()} />);

    expect(screen.getByText("Conquista nova")).toBeInTheDocument();
    expect(screen.getByText("Primeiro treino")).toBeInTheDocument();
    expect(
      screen.getByText("O começo, que é a parte mais difícil."),
    ).toBeInTheDocument();
  });

  it("recorde mostra a marca nova, com unidade", () => {
    render(
      <FestaDeConquistas
        novas={[
          marco({
            code: "RECORDE_DIAS",
            kind: "RECORDE",
            nome: "Mais dias seguidos",
            descricao: null,
            unidade: "dias",
            valor: 5,
          }),
        ]}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.getByText("Nova marca: 5 dias")).toBeInTheDocument();
  });

  it("pluraliza quando ha mais de uma", () => {
    render(
      <FestaDeConquistas
        novas={[marco(), marco({ code: "DIAS_10", nome: "10 dias de treino" })]}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.getByText("2 conquistas novas")).toBeInTheDocument();
  });

  it("da para fechar a comemoracao", async () => {
    const onFechar = vi.fn();
    render(<FestaDeConquistas novas={[marco()]} onFechar={onFechar} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Fechar comemoração" }),
    );

    expect(onFechar).toHaveBeenCalled();
  });
});

describe("ResumoConquistas", () => {
  it("nao aparece para quem ainda nao tem nada e nao tem proximo", () => {
    const { container } = render(
      <ResumoConquistas conquistas={{ novas: [], total: 0, proximo: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra quantos marcos e o proximo degrau", () => {
    render(
      <ResumoConquistas
        conquistas={{
          novas: [],
          total: 3,
          proximo: { code: "DIAS_10", nome: "10 dias de treino", progresso: 6, alvo: 10 },
        }}
      />,
    );

    expect(screen.getByText("3 marcos")).toBeInTheDocument();
    expect(screen.getByText("10 dias de treino")).toBeInTheDocument();
    expect(screen.getByText("6/10")).toBeInTheDocument();
  });

  // O que falta nao pode virar cobranca: a barra mostra o quanto ja andou.
  it("a barra representa o progresso, nao a divida", () => {
    const { container } = render(
      <ResumoConquistas
        conquistas={{
          novas: [],
          total: 1,
          proximo: { code: "DIAS_10", nome: "10 dias", progresso: 3, alvo: 10 },
        }}
      />,
    );

    const cheia = container.querySelector(".conquistas-barra-cheia") as HTMLElement;
    expect(cheia.style.width).toBe("30%");
    expect(screen.queryByText(/faltam|voce nao|perdeu/i)).not.toBeInTheDocument();
  });

  it("usa singular com um marco so", () => {
    render(
      <ResumoConquistas conquistas={{ novas: [], total: 1, proximo: null }} />,
    );

    expect(screen.getByText("1 marco")).toBeInTheDocument();
  });
});

describe("ConviteDeRecomeco", () => {
  it("nao aparece na maioria dos dias", () => {
    const { container } = render(<ConviteDeRecomeco tipo={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("convida na virada de mes e na de ano", () => {
    const { rerender } = render(<ConviteDeRecomeco tipo="MES" />);
    expect(screen.getByText(/Mês novo/)).toBeInTheDocument();

    rerender(<ConviteDeRecomeco tipo="ANO" />);
    expect(screen.getByText(/Ano novo/)).toBeInTheDocument();
  });

  // O texto nunca menciona o que ficou para tras.
  it("convida sem cobrar", () => {
    render(<ConviteDeRecomeco tipo="MES" />);

    expect(screen.queryByText(/perdeu|faltou|voce nao|de novo do zero/i)).not.toBeInTheDocument();
  });
});
