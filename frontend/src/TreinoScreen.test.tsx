import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreinoScreen } from "./TreinoScreen";
import type { MetaSemanal, ResumoSessoes, Sessao } from "./types";

/**
 * Testes de apresentacao da aba Treino.
 *
 * O que ESTE arquivo cobre: que a tela mostra o aviso de servidor acordando e o
 * convite de tentar de novo quando recebe esses estados. O que ele **nao**
 * cobre: o `setTimeout` que decide QUANDO ligar o aviso -- isso vive no
 * PontoScreen e a regra por tras esta em rede.test.ts. Testar o timer aqui
 * exigiria relogio falso para ganhar pouco, e o vazio de cobertura fica dito em
 * voz alta em vez de parecer coberto.
 */

function meta(): MetaSemanal {
  return {
    semana: { inicio: "2026-08-31", fim: "2026-09-06" },
    meta: 3,
    treinos: 0,
    faltam: 3,
    cumprida: false,
    streakSemanas: 0,
    tokens: 2,
    metaAgendada: null,
    reparo: null,
    recomeco: false,
    limites: { metaMin: 3, metaMax: 6 },
  };
}

function resumo(emAndamento: Sessao | null = null): ResumoSessoes {
  return {
    emAndamento,
    streak: 0,
    recordeDiario: 0,
    semana: { treinos: 0, minutos: 0 },
    meta: meta(),
    conquistas: { novas: [], total: 0, proximo: null },
    freshStart: null,
    regras: {
      duracaoMinimaMin: 20,
      registro: { tiposMax: 3, esforcoMin: 1, esforcoMax: 5, notaMax: 280 },
    },
  };
}

function montar(over: Partial<Parameters<typeof TreinoScreen>[0]> = {}) {
  const props = {
    resumo: resumo(),
    carregando: false,
    enviando: false,
    onAlternar: vi.fn(),
    onAlterarMeta: vi.fn(),
    salvandoMeta: false,
    novasConquistas: [],
    onFecharFesta: vi.fn(),
    erro: null,
    sucesso: null,
    acordando: false,
    podeTentarDeNovo: false,
    registro: null,
    ...over,
  };
  render(<TreinoScreen {...props} />);
  return props;
}

describe("aviso de servidor acordando", () => {
  it("explica a espera em vez de deixar o botao parecendo travado", () => {
    montar({ acordando: true });

    // O texto tem de dizer o motivo: "Carregando..." por 60 segundos parece
    // app quebrado, e a pessoa fecha antes de o servidor subir.
    expect(screen.getByRole("status")).toHaveTextContent(/acordando/i);
  });

  it("nao aparece quando o servidor responde normal", () => {
    montar({ acordando: false });

    expect(screen.queryByText(/acordando/i)).not.toBeInTheDocument();
  });

  it("nao e tratado como erro", () => {
    // Cor e papel de erro aqui ensinariam a pessoa a achar que o app quebrou
    // justamente quando ele esta funcionando -- so devagar.
    montar({ acordando: true });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("convite de tentar de novo", () => {
  it("aparece so quando ficou provado que o toque nao valeu", () => {
    montar({ podeTentarDeNovo: true, erro: "Nao deu para registrar" });

    expect(
      screen.getByRole("button", { name: /Tentar de novo/ }),
    ).toBeInTheDocument();
  });

  it("nao aparece por padrao", () => {
    montar();

    expect(
      screen.queryByRole("button", { name: /Tentar de novo/ }),
    ).not.toBeInTheDocument();
  });

  it("desaparece enquanto uma tentativa esta em voo", () => {
    // Deixar o botao ativo durante o envio convidaria a um segundo toque, e
    // dois toques no toggle se anulam.
    montar({ podeTentarDeNovo: true, enviando: true });

    expect(
      screen.queryByRole("button", { name: /Tentar de novo/ }),
    ).not.toBeInTheDocument();
  });

  it("repete a mesma acao do botao principal", async () => {
    const { onAlternar } = montar({ podeTentarDeNovo: true });

    await userEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));

    expect(onAlternar).toHaveBeenCalledTimes(1);
  });
});
