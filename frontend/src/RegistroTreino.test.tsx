import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegistroTreino, ResumoDoRegistro } from "./RegistroTreino";
import type { Sessao } from "./types";

const LIMITES = { tiposMax: 3, esforcoMin: 1, esforcoMax: 5, notaMax: 280 };

function sessao(over: Partial<Sessao> = {}): Sessao {
  return {
    id: "s1",
    startedAt: "2026-08-26T13:00:00.000Z",
    endedAt: "2026-08-26T14:00:00.000Z",
    durationMin: 60,
    status: "COMPLETED",
    source: "APP",
    dayKey: "2026-08-26",
    contavel: true,
    corrigivel: true,
    workoutTypes: [],
    effort: null,
    note: null,
    ...over,
  };
}

function montar(over: Partial<Sessao> = {}, props: Record<string, unknown> = {}) {
  const onSalvar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <RegistroTreino
      sessao={sessao(over)}
      limites={LIMITES}
      onSalvar={onSalvar}
      onCancelar={onCancelar}
      {...props}
    />,
  );
  return { onSalvar, onCancelar };
}

describe("RegistroTreino", () => {
  // O check-out sustenta streak, meta e placar. Se preencher parecer
  // obrigatorio, arrisca-se a metrica que ja funciona.
  it("deixa claro que e opcional e oferece sair sem preencher", async () => {
    const { onCancelar } = montar();

    expect(screen.getByText("opcional")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Agora não/ }));

    expect(onCancelar).toHaveBeenCalled();
  });

  it("salvar sem preencher nada e permitido", async () => {
    const { onSalvar } = montar();

    await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

    expect(onSalvar).toHaveBeenCalledWith({
      workoutTypes: [],
      effort: null,
      note: null,
    });
  });

  describe("tipo de treino", () => {
    it("marca e desmarca", async () => {
      const { onSalvar } = montar();

      await userEvent.click(screen.getByRole("button", { name: "Peito" }));
      await userEvent.click(screen.getByRole("button", { name: "Braços" }));
      await userEvent.click(screen.getByRole("button", { name: "Peito" }));
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({ workoutTypes: ["BRACOS"] }),
      );
    });

    it("aceita mais de um: 'peito e triceps' e o caso comum", async () => {
      const { onSalvar } = montar();

      await userEvent.click(screen.getByRole("button", { name: "Peito" }));
      await userEvent.click(screen.getByRole("button", { name: "Braços" }));
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({ workoutTypes: ["PEITO", "BRACOS"] }),
      );
    });

    // Ignorar o clique em silencio seria pior: a pessoa acharia que marcou.
    it("no teto, desabilita os nao marcados em vez de ignorar o clique", async () => {
      montar();

      for (const nome of ["Peito", "Costas", "Pernas"]) {
        await userEvent.click(screen.getByRole("button", { name: nome }));
      }

      expect(screen.getByRole("button", { name: "Ombros" })).toBeDisabled();
      // Os ja marcados continuam clicaveis, senao nao daria pra trocar.
      expect(screen.getByRole("button", { name: "Peito" })).toBeEnabled();
    });

    it("comeca com o que ja estava salvo", () => {
      montar({ workoutTypes: ["CARDIO"] });

      expect(screen.getByRole("button", { name: "Cardio" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("esforço", () => {
    it("marca o nivel e mostra o rotulo", async () => {
      const { onSalvar } = montar();

      await userEvent.click(screen.getByRole("button", { name: "4 - Puxado" }));

      expect(screen.getByText("Puxado")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));
      expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ effort: 4 }));
    });

    // Sem isso nao haveria como voltar atras depois de tocar sem querer.
    it("clicar no que ja esta marcado desmarca", async () => {
      const { onSalvar } = montar();

      await userEvent.click(screen.getByRole("button", { name: "3 - Moderado" }));
      await userEvent.click(screen.getByRole("button", { name: "3 - Moderado" }));
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ effort: null }));
    });

    it("oferece exatamente os niveis que o servidor definiu", () => {
      montar();

      const grupo = screen.getByRole("group", { name: "Esforço percebido" });
      expect(within(grupo).getAllByRole("button")).toHaveLength(5);
    });
  });

  describe("anotação", () => {
    it("guarda o texto", async () => {
      const { onSalvar } = montar();

      await userEvent.type(
        screen.getByLabelText("Anotação"),
        "supino 4x10 com 40kg",
      );
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({ note: "supino 4x10 com 40kg" }),
      );
    });

    it("so espaco vira nulo, nao nota vazia", async () => {
      const { onSalvar } = montar();

      await userEvent.type(screen.getByLabelText("Anotação"), "   ");
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
    });

    it("respeita o limite do servidor", () => {
      montar();

      expect(screen.getByLabelText("Anotação")).toHaveAttribute("maxLength", "280");
    });

    it("mostra o contador", async () => {
      montar();

      await userEvent.type(screen.getByLabelText("Anotação"), "remada");
      expect(screen.getByText("6/280")).toBeInTheDocument();
    });
  });

  it("trava tudo enquanto salva, pra nao mandar duas vezes", () => {
    montar({}, { salvando: true });

    expect(screen.getByRole("button", { name: /Salvando/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Peito" })).toBeDisabled();
    expect(screen.getByLabelText("Anotação")).toBeDisabled();
  });

  it("mostra o erro do servidor", () => {
    montar({}, { erro: "Nao foi possivel salvar o registro" });

    expect(screen.getByText("Nao foi possivel salvar o registro")).toBeInTheDocument();
  });
});

describe("ResumoDoRegistro", () => {
  it("nao ocupa espaco quando nao ha registro", () => {
    const { container } = render(<ResumoDoRegistro sessao={sessao()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra tipos, esforco e nota", () => {
    render(
      <ResumoDoRegistro
        sessao={sessao({
          workoutTypes: ["PEITO", "BRACOS"],
          effort: 4,
          note: "supino 4x10",
        })}
      />,
    );

    expect(screen.getByText("Peito")).toBeInTheDocument();
    expect(screen.getByText("Braços")).toBeInTheDocument();
    expect(screen.getByText("Esforço 4 · Puxado")).toBeInTheDocument();
    expect(screen.getByText("supino 4x10")).toBeInTheDocument();
  });

  it("aparece mesmo com so um dos tres preenchido", () => {
    render(<ResumoDoRegistro sessao={sessao({ note: "corrida leve" })} />);

    expect(screen.getByText("corrida leve")).toBeInTheDocument();
  });
});
