import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorDeExercicio, SeriesDoTreino } from "./SeriesDoTreino";
import type { Exercicio, ExercicioDoTreino, Serie } from "./types";

const s = (reps: number, pesoG: number | null): Serie => ({ reps, pesoG });

function editor(over: Partial<Parameters<typeof EditorDeExercicio>[0]> = {}) {
  const onSalvar = vi.fn();
  render(
    <EditorDeExercicio
      nome="Supino reto"
      series={[]}
      ultimaVez={null}
      salvando={false}
      onSalvar={onSalvar}
      onCancelar={vi.fn()}
      {...over}
    />,
  );
  return { onSalvar };
}

const campoCarga = (n: number) =>
  screen.getByLabelText(`Carga da série ${n}, em quilos`) as HTMLInputElement;
const campoReps = (n: number) =>
  screen.getByLabelText(`Repetições da série ${n}`) as HTMLInputElement;

describe("EditorDeExercicio", () => {
  it("abre com uma serie, para nao comecar vazio", () => {
    editor();

    expect(campoReps(1)).toBeInTheDocument();
  });

  // O que economiza toque na academia: 4x10 com 40kg e digitar uma vez.
  it("serie nova nasce com os valores da anterior", async () => {
    editor({ series: [s(10, 40000)] });

    await userEvent.click(screen.getByRole("button", { name: "Série" }));

    expect(campoReps(2).value).toBe("10");
    expect(campoCarga(2).value).toBe("40");
  });

  it("salva o que foi digitado, sem a identidade interna", async () => {
    const { onSalvar } = editor({ series: [s(10, 40000)] });

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith([{ reps: 10, pesoG: 40000 }]);
  });

  // parseFloat("42,5") devolveria 42 e a fracao sumiria em silencio.
  it("aceita virgula como separador decimal", async () => {
    const { onSalvar } = editor({ series: [s(10, null)] });

    await userEvent.type(campoCarga(1), "42,5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith([{ reps: 10, pesoG: 42500 }]);
  });

  it("campo de carga vazio e peso do corpo, e salva", async () => {
    const { onSalvar } = editor({ series: [s(8, null)] });

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSalvar).toHaveBeenCalledWith([{ reps: 8, pesoG: null }]);
  });

  /**
   * Regressao de um bug real: com `key={indice}` o React reaproveitava as
   * linhas ao remover uma serie, e o campo de carga passava a mostrar o texto
   * do vizinho -- o valor certo estava no estado, e a tela mentia.
   */
  it("remover a serie do meio nao embaralha o que os campos mostram", async () => {
    const { onSalvar } = editor({
      series: [s(12, 40000), s(10, 45000), s(8, 50000)],
    });

    await userEvent.click(screen.getByRole("button", { name: "Remover série 2" }));

    expect(campoCarga(1).value).toBe("40");
    expect(campoCarga(2).value).toBe("50");
    expect(campoReps(2).value).toBe("8");

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith([
      { reps: 12, pesoG: 40000 },
      { reps: 8, pesoG: 50000 },
    ]);
  });

  describe("repetir a ultima vez", () => {
    it("nao aparece para exercicio estreando", () => {
      editor({ ultimaVez: { dia: null, series: [] } });

      expect(screen.queryByText(/Repetir/)).not.toBeInTheDocument();
    });

    it("traz as series do treino anterior de uma vez", async () => {
      const { onSalvar } = editor({
        ultimaVez: { dia: "2026-09-10", series: [s(10, 40000), s(8, 42500)] },
      });

      await userEvent.click(screen.getByRole("button", { name: /Repetir/ }));

      expect(campoCarga(1).value).toBe("40");
      expect(campoCarga(2).value).toBe("42,5");

      await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
      expect(onSalvar).toHaveBeenCalledWith([
        { reps: 10, pesoG: 40000 },
        { reps: 8, pesoG: 42500 },
      ]);
    });

    it("mostra o resumo do que vai repetir", () => {
      editor({
        ultimaVez: { dia: "2026-09-10", series: [s(10, 40000), s(10, 40000)] },
      });

      expect(screen.getByRole("button", { name: /2x10 · 40 kg/ })).toBeInTheDocument();
    });
  });
});

describe("SeriesDoTreino", () => {
  const catalogo: Exercicio[] = [
    { id: "e1", nome: "Supino reto", series: 12 },
    { id: "e2", nome: "Remada curvada", series: 4 },
  ];

  function lista(exercicios: ExercicioDoTreino[] = []) {
    const props = {
      onSalvar: vi.fn(),
      onRemover: vi.fn(),
      onAbrirProgressao: vi.fn(),
      onAbrirEditor: vi.fn(),
    };
    render(
      <SeriesDoTreino
        exercicios={exercicios}
        catalogo={catalogo}
        ultimaVezDe={() => null}
        salvando={false}
        {...props}
      />,
    );
    return props;
  }

  // Anotar e opcional: o treino conta do mesmo jeito, e a tela precisa dizer.
  it("o vazio nao cobra", () => {
    lista();

    expect(screen.getByText(/opcional/i)).toBeInTheDocument();
    expect(screen.queryByText(/faltou|voce nao|precisa/i)).not.toBeInTheDocument();
  });

  it("mostra o resumo de cada exercicio", () => {
    lista([{ id: "e1", nome: "Supino reto", series: [s(10, 40000), s(10, 40000)] }]);

    expect(screen.getByText("Supino reto")).toBeInTheDocument();
    expect(screen.getByText("2x10 · 40 kg")).toBeInTheDocument();
  });

  // Buscar "a ultima vez" e efeito: sai do evento, nunca do render.
  it("avisa que o editor abriu, para o container buscar a ultima vez", async () => {
    const { onAbrirEditor } = lista([
      { id: "e1", nome: "Supino reto", series: [s(10, 40000)] },
    ]);

    // `^` porque "Ver progressão de Supino reto" tambem casaria.
    await userEvent.click(screen.getByRole("button", { name: /^Supino reto/ }));

    expect(onAbrirEditor).toHaveBeenCalledWith("Supino reto");
  });

  it("sugere do proprio historico ao escolher exercicio", async () => {
    lista();

    await userEvent.click(screen.getByRole("button", { name: /Exercício/ }));

    expect(screen.getByRole("button", { name: "Supino reto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remada curvada" })).toBeInTheDocument();
  });

  it("filtra a sugestao conforme se digita", async () => {
    lista();

    await userEvent.click(screen.getByRole("button", { name: /Exercício/ }));
    await userEvent.type(screen.getByLabelText("Nome do exercício"), "rem");

    expect(screen.getByRole("button", { name: "Remada curvada" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supino reto" })).not.toBeInTheDocument();
  });

  it("deixa criar um nome que ainda nao existe", async () => {
    const { onAbrirEditor } = lista();

    await userEvent.click(screen.getByRole("button", { name: /Exercício/ }));
    await userEvent.type(screen.getByLabelText("Nome do exercício"), "Crucifixo");
    await userEvent.click(screen.getByRole("button", { name: /Usar/ }));

    expect(onAbrirEditor).toHaveBeenCalledWith("Crucifixo");
  });

  it("nao oferece criar o que ja esta no catalogo", async () => {
    lista();

    await userEvent.click(screen.getByRole("button", { name: /Exercício/ }));
    await userEvent.type(screen.getByLabelText("Nome do exercício"), "Supino reto");

    expect(screen.queryByRole("button", { name: /Usar/ })).not.toBeInTheDocument();
  });
});
