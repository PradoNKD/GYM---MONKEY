import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetaSemana } from "./MetaSemana";
import type { MetaSemanal } from "./types";

function meta(over: Partial<MetaSemanal> = {}): MetaSemanal {
  return {
    semana: { inicio: "2026-08-24", fim: "2026-08-30" },
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
    ...over,
  };
}

function montar(over: Partial<MetaSemanal> = {}, props: Record<string, unknown> = {}) {
  const onAlterarMeta = vi.fn();
  render(
    <MetaSemana
      meta={meta(over)}
      recordeDiario={0}
      minutosNaSemana={0}
      onAlterarMeta={onAlterarMeta}
      {...props}
    />,
  );
  return { onAlterarMeta };
}

describe("MetaSemana", () => {
  it("nao renderiza nada enquanto o resumo nao chegou", () => {
    const { container } = render(
      <MetaSemana
        meta={undefined}
        recordeDiario={0}
        minutosNaSemana={0}
        onAlterarMeta={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  describe("progresso da semana", () => {
    it("desenha um ponto por treino da meta e marca os feitos", () => {
      montar({ meta: 4, treinos: 2, faltam: 2 });

      const barra = screen.getByRole("img", { name: "2 de 4 treinos nesta semana" });
      const pontos = barra.querySelectorAll(".meta-ponto");

      expect(pontos).toHaveLength(4);
      expect(barra.querySelectorAll('[data-feito="true"]')).toHaveLength(2);
    });

    it("diz quantos treinos faltam, no singular", () => {
      montar({ meta: 3, treinos: 2, faltam: 1 });

      expect(screen.getByText("Falta 1 treino para fechar a semana.")).toBeInTheDocument();
    });

    it("no plural tambem", () => {
      montar({ meta: 5, treinos: 3, faltam: 2 });

      expect(
        screen.getByText("Faltam 2 treinos para fechar a semana."),
      ).toBeInTheDocument();
    });

    it("na semana ainda zerada convida em vez de cobrar", () => {
      montar({ meta: 4, treinos: 0, faltam: 4 });

      expect(screen.getByText("4 treinos essa semana fecham a meta.")).toBeInTheDocument();
    });

    it("comemora a meta batida", () => {
      montar({ meta: 3, treinos: 3, faltam: 0, cumprida: true });

      expect(
        screen.getByText("Meta da semana batida. O que vier a mais e lucro."),
      ).toBeInTheDocument();
    });

    it("treino acima da meta aparece como extra", () => {
      montar({ meta: 3, treinos: 5, faltam: 0, cumprida: true });

      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("sequencia e congelamentos", () => {
    it("mostra semanas seguidas e congelamentos guardados", () => {
      montar({ streakSemanas: 6, tokens: 1 });

      expect(screen.getByText("6")).toBeInTheDocument();
      expect(screen.getByText("semanas seguidas")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("congelamento")).toBeInTheDocument();
    });

    it("usa o singular com uma semana so", () => {
      montar({ streakSemanas: 1 });

      expect(screen.getByText("semana seguida")).toBeInTheDocument();
    });
  });

  describe("tom das mensagens", () => {
    // Restricao permanente do produto: nada de culpa por quem sumiu.
    it("depois de um mes fora, convida em vez de cobrar", () => {
      montar({ recomeco: true, streakSemanas: 0, treinos: 0 });

      expect(
        screen.getByText("Bom te ver de volta. Essa semana comeca uma sequencia nova."),
      ).toBeInTheDocument();
      // Nao aparece nada dizendo quanto ela perdeu.
      expect(screen.queryByText(/perdeu|faltou|voce nao/i)).not.toBeInTheDocument();
    });

    it("oferece o reparo em vez de so anunciar a perda", () => {
      montar({ reparo: { streakSalva: 7, exige: 4 } });

      expect(
        screen.getByText(
          "Faca 4 treinos essa semana e voce recupera a sequencia de 7 semanas.",
        ),
      ).toBeInTheDocument();
    });

    it("o recorde de dias so aparece quando existe", () => {
      montar({}, { recordeDiario: 0 });
      expect(screen.queryByText(/Recorde/)).not.toBeInTheDocument();
    });

    it("e mostra o recorde quando ha um", () => {
      montar({}, { recordeDiario: 12 });
      expect(screen.getByText(/Recorde: 12 dias seguidos/)).toBeInTheDocument();
    });
  });

  describe("troca de meta", () => {
    it("oferece so as metas dentro dos limites do servidor", () => {
      montar({ limites: { metaMin: 3, metaMax: 6 } });

      const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
      expect(opcoes).toEqual([
        // Encurtado de "3x por semana" para "3x": o titulo ao lado ja diz
        // "Meta da semana", e o seletor precisou de 16px de fonte (senao o
        // Safari do iOS da zoom ao focar), o que nao caberia com o texto
        // longo. O contexto completo segue no rotulo acessivel do campo.
        "3x",
        "4x",
        "5x",
        "6x",
      ]);
    });

    it("avisa a partir de quando a meta nova vale", () => {
      montar({ meta: 3, metaAgendada: { meta: 5, validaDe: "2026-08-31" } });

      expect(
        screen.getByText("A meta de 5x por semana vale a partir de 31/08."),
      ).toBeInTheDocument();
    });

    // Senao a escolha parece nao ter sido salva: a pessoa escolhe 5, o
    // seletor volta pra 3 (a meta ainda em vigor) e ela troca de novo.
    it("o seletor mostra a meta escolhida, mesmo antes de entrar em vigor", () => {
      montar({ meta: 3, metaAgendada: { meta: 6, validaDe: "2026-08-31" } });

      expect(screen.getByRole("combobox")).toHaveValue("6");
    });

    it("mostra a meta em vigor quando nao ha nada agendado", () => {
      montar({ meta: 4 });

      expect(screen.getByRole("combobox")).toHaveValue("4");
    });

    it("avisa quem escolheu uma meta nova", async () => {
      const { onAlterarMeta } = montar({ meta: 3 });

      await userEvent.selectOptions(screen.getByRole("combobox"), "5");

      expect(onAlterarMeta).toHaveBeenCalledWith(5);
    });

    it("trava o seletor enquanto salva, pra nao disparar duas trocas", () => {
      montar({}, { salvandoMeta: true });

      expect(screen.getByRole("combobox")).toBeDisabled();
    });
  });

  // Pedido do dono do produto depois de testar no celular: "eu sei o que o
  // floco de neve faz porque desenvolvi, outras pessoas nao vao saber".
  //
  // ATENCAO A DESVIO: os numeros do texto (2 guardados, +1 a cada 4 semanas)
  // sao os do servidor -- TOKENS_MAX e SEMANAS_POR_TOKEN em
  // backend/src/sessions/semanas.ts. A API nao envia essas duas constantes,
  // entao aqui elas estao escritas a mao. Se mudarem la, este texto mente, e
  // este teste e o lugar onde isso aparece.
  describe("explica os conceitos quando alguem pergunta", () => {
    it("o congelamento: o que faz, quantos da e quanto guarda", async () => {
      montar({ tokens: 2 });

      await userEvent.click(
        screen.getByRole("button", { name: "O que e um congelamento?" }),
      );

      const dica = await screen.findByRole("tooltip");
      expect(dica).toHaveTextContent("a sua sequencia NAO quebra");
      expect(dica).toHaveTextContent("1 a cada 4 semanas cumpridas seguidas");
      expect(dica).toHaveTextContent("no maximo 2");
    });

    it("as semanas seguidas: contam por semana, e descanso nao quebra", async () => {
      montar({ streakSemanas: 3 });

      await userEvent.click(
        screen.getByRole("button", { name: "O que sao semanas seguidas?" }),
      );

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "descansar nao quebra nada",
      );
    });

    it("a meta: que a troca vale so na proxima semana", async () => {
      // A regra mais facil de entender errado: trocar a meta no meio da
      // semana nao facilita nem apaga a semana em andamento.
      montar({});

      await userEvent.click(
        screen.getByRole("button", { name: "O que e a meta da semana?" }),
      );

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "vale a partir da PROXIMA semana",
      );
    });

    it("nenhuma explicacao aparece sem alguem pedir", () => {
      montar({});

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
