import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PontoScreen } from "./PontoScreen";
import { ApiError } from "./api";
import type {
  MapaDoAno,
  MetaSemanal,
  PaginaSessoes,
  Sessao,
  StatusSessao,
} from "./types";

const logout = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    token: "tok",
    user: { id: "u1", name: "Fulano de Souza", email: "f@x.com", role: "USER" },
    logout,
    login: vi.fn(),
    cadastrar: vi.fn(),
  }),
}));

vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...real,
    buscarSessoes: vi.fn(),
    alternarTreino: vi.fn(),
    corrigirSessao: vi.fn(),
    alterarMeta: vi.fn(),
    anotarSessao: vi.fn(),
    buscarMapa: vi.fn(),
    marcarConquistasVistas: vi.fn(),
  };
});

const {
  buscarSessoes,
  alternarTreino,
  corrigirSessao,
  alterarMeta,
  anotarSessao,
  buscarMapa,
  marcarConquistasVistas,
} = await import("./api");

function mapaVazio(): MapaDoAno {
  return {
    inicio: "2026-08-24",
    fim: "2026-08-30",
    dias: [],
    total: { dias: 0, treinos: 0, minutos: 0 },
  };
}

const SEM_CONQUISTAS = { novas: [], total: 0, proximo: null };

const REGRAS = {
  duracaoMinimaMin: 20,
  registro: { tiposMax: 3, esforcoMin: 1, esforcoMax: 5, notaMax: 280 },
};

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

function sessao(over: Partial<Sessao> & { dayKey: string }): Sessao {
  const status: StatusSessao = over.status ?? "COMPLETED";
  return {
    id: over.id ?? `s-${Math.random().toString(36).slice(2)}`,
    startedAt: over.startedAt ?? `${over.dayKey}T13:00:00.000Z`,
    endedAt: over.endedAt !== undefined ? over.endedAt : `${over.dayKey}T14:00:00.000Z`,
    durationMin: over.durationMin !== undefined ? over.durationMin : 60,
    status,
    source: "APP",
    dayKey: over.dayKey,
    workoutTypes: over.workoutTypes ?? [],
    effort: over.effort !== undefined ? over.effort : null,
    note: over.note !== undefined ? over.note : null,
    contavel: over.contavel ?? status === "COMPLETED",
    corrigivel: over.corrigivel ?? status !== "OPEN",
  };
}

function pagina(over: Partial<PaginaSessoes> = {}): PaginaSessoes {
  return {
    itens: over.itens ?? [],
    proximoCursor: over.proximoCursor ?? null,
    resumo: {
      emAndamento: null,
      streak: 0,
      recordeDiario: 0,
      semana: { treinos: 0, minutos: 0 },
      meta: meta(),
      conquistas: SEM_CONQUISTAS,
      freshStart: null,
      regras: REGRAS,
      ...over.resumo,
    },
  };
}

const hoje = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const CHAVE_HOJE = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

// A tela virou tres abas. Consulta do passado (lista, mapa, correcao) mora na
// aba Historico, e identidade/sair na aba Perfil -- entao o teste tem de ir
// ate la, como a pessoa vai. Sem isto, um teste que afirma AUSENCIA passaria
// por estar na aba errada, o que e pior que falhar.
async function irParaHistorico() {
  await userEvent.click(await screen.findByRole("button", { name: "Histórico" }));
}

async function irParaPerfil() {
  await userEvent.click(await screen.findByRole("button", { name: "Perfil" }));
}

describe("PontoScreen (sessoes)", () => {
  beforeEach(() => {
    vi.mocked(buscarSessoes).mockReset().mockResolvedValue(pagina());
    vi.mocked(buscarMapa).mockReset().mockResolvedValue(mapaVazio());
    vi.mocked(marcarConquistasVistas).mockReset().mockResolvedValue({ marcadas: 0 });
    vi.mocked(alternarTreino).mockReset();
    vi.mocked(corrigirSessao).mockReset();
    logout.mockReset();
  });

  describe("carregamento", () => {
    it("busca as sessoes com o token", async () => {
      render(<PontoScreen />);

      await waitFor(() => expect(buscarSessoes).toHaveBeenCalledWith("tok"));
    });

    it("mostra estado vazio quando nao ha treino nenhum", async () => {
      render(<PontoScreen />);
      await irParaHistorico();

      expect(await screen.findByText(/Nenhum treino ainda/)).toBeInTheDocument();
    });

    it("mostra a mensagem de erro da API", async () => {
      vi.mocked(buscarSessoes).mockRejectedValue(new ApiError("Conta desativada"));
      render(<PontoScreen />);

      expect(await screen.findByText("Conta desativada")).toBeInTheDocument();
    });

    it("usa mensagem generica quando o erro nao e da API", async () => {
      vi.mocked(buscarSessoes).mockRejectedValue(new TypeError("Failed to fetch"));
      render(<PontoScreen />);

      expect(
        await screen.findByText("Nao foi possivel carregar o historico"),
      ).toBeInTheDocument();
    });
  });

  describe("registro do treino (Fase A)", () => {
    // O check-out e o momento de maior intencao. Pedir depois, numa tela
    // separada, e pedir para quem ja guardou o celular.
    it("abre o registro sozinho depois de finalizar o treino", async () => {
      const aberta = sessao({ dayKey: CHAVE_HOJE, status: "OPEN", endedAt: null });
      const fechada = sessao({ id: aberta.id, dayKey: CHAVE_HOJE });

      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [aberta], resumo: { ...pagina().resumo, emAndamento: aberta } }),
      );
      vi.mocked(alternarTreino).mockResolvedValue(fechada);

      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Finalizar treino" });

      vi.mocked(buscarSessoes).mockResolvedValue(pagina({ itens: [fechada] }));
      await userEvent.click(screen.getByRole("button", { name: "Finalizar treino" }));

      expect(await screen.findByLabelText("Registrar o treino")).toBeInTheDocument();
    });

    it("nao abre o registro ao COMECAR o treino", async () => {
      const aberta = sessao({ dayKey: CHAVE_HOJE, status: "OPEN", endedAt: null });

      vi.mocked(buscarSessoes).mockResolvedValue(pagina());
      vi.mocked(alternarTreino).mockResolvedValue(aberta);

      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Começar treino" });

      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [aberta], resumo: { ...pagina().resumo, emAndamento: aberta } }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Começar treino" }));

      await screen.findByRole("button", { name: "Finalizar treino" });
      expect(screen.queryByLabelText("Registrar o treino")).not.toBeInTheDocument();
    });

    it("salva o registro e recarrega os numeros do servidor", async () => {
      const s = sessao({ dayKey: CHAVE_HOJE });
      vi.mocked(buscarSessoes).mockResolvedValue(pagina({ itens: [s] }));
      vi.mocked(anotarSessao).mockResolvedValue({ ...s, effort: 4 });

      render(<PontoScreen />);
      await irParaHistorico();
      await userEvent.click(
        await screen.findByRole("button", { name: "Registrar o treino" }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Pernas" }));
      await userEvent.click(screen.getByRole("button", { name: "4 - Puxado" }));
      await userEvent.type(screen.getByLabelText("Anotação"), "agachamento 3x12");
      vi.mocked(buscarSessoes).mockClear();
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(anotarSessao).toHaveBeenCalledWith("tok", s.id, {
        workoutTypes: ["PERNAS"],
        effort: 4,
        note: "agachamento 3x12",
      });
      await waitFor(() => expect(buscarSessoes).toHaveBeenCalled());
    });

    it("mostra o registro no historico", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [
            sessao({
              dayKey: CHAVE_HOJE,
              workoutTypes: ["COSTAS"],
              effort: 3,
              note: "remada 4x10",
            }),
          ],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(await screen.findByText("Costas")).toBeInTheDocument();
      expect(screen.getByText("Esforço 3 · Moderado")).toBeInTheDocument();
      expect(screen.getByText("remada 4x10")).toBeInTheDocument();
    });

    it("mostra o erro do servidor sem fechar o formulario", async () => {
      const s = sessao({ dayKey: CHAVE_HOJE });
      vi.mocked(buscarSessoes).mockResolvedValue(pagina({ itens: [s] }));
      vi.mocked(anotarSessao).mockRejectedValue(new ApiError("Sessao nao encontrada"));

      render(<PontoScreen />);
      await irParaHistorico();
      await userEvent.click(
        await screen.findByRole("button", { name: "Registrar o treino" }),
      );
      await userEvent.click(screen.getByRole("button", { name: /Salvar/ }));

      expect(await screen.findByText("Sessao nao encontrada")).toBeInTheDocument();
      expect(screen.getByLabelText("Registrar o treino")).toBeInTheDocument();
    });

    // Corrigir mexe no que CONTA e e auditado; anotar e rotulo. A tela nao
    // pode confundir as duas coisas.
    it("treino em andamento nao oferece registro", async () => {
      const aberta = sessao({ dayKey: CHAVE_HOJE, status: "OPEN", endedAt: null });
      vi.mocked(buscarSessoes).mockResolvedValue(pagina({ itens: [aberta] }));

      render(<PontoScreen />);
      await irParaHistorico();
      // Espera a LINHA da sessao aparecer antes de afirmar que o botao nao
      // esta nela. Sem esta ancora o teste passaria com a lista ainda vazia --
      // afirmando ausencia num lugar onde nada chegou.
      await screen.findByText("em andamento");

      expect(
        screen.queryByRole("button", { name: "Registrar o treino" }),
      ).not.toBeInTheDocument();
    });

    it("treino que ja gastou a correcao ainda pode ser anotado", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, corrigivel: false })] }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(
        await screen.findByRole("button", { name: "Registrar o treino" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Corrigir treino" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("conquistas", () => {
    const marcoNovo = {
      code: "PRIMEIRO_TREINO",
      kind: "MARCO" as const,
      nome: "Primeiro treino",
      descricao: "O começo, que é a parte mais difícil.",
      unidade: null,
      valor: null,
      em: "2026-08-31T12:00:00.000Z",
    };

    it("comemora a conquista nova que o servidor mandou", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          resumo: {
            ...pagina().resumo,
            conquistas: { novas: [marcoNovo], total: 1, proximo: null },
          },
        }),
      );

      render(<PontoScreen />);

      expect(await screen.findByLabelText("Conquista nova")).toBeInTheDocument();
      expect(screen.getByText("Primeiro treino")).toBeInTheDocument();
    });

    // Sem avisar o servidor, a mesma festa voltaria em toda visita.
    it("fechar a festa avisa o servidor e some da tela", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          resumo: {
            ...pagina().resumo,
            conquistas: { novas: [marcoNovo], total: 1, proximo: null },
          },
        }),
      );

      render(<PontoScreen />);
      await screen.findByLabelText("Conquista nova");

      await userEvent.click(
        screen.getByRole("button", { name: "Fechar comemoração" }),
      );

      expect(marcarConquistasVistas).toHaveBeenCalledWith("tok");
      expect(screen.queryByLabelText("Conquista nova")).not.toBeInTheDocument();
    });

    it("sem conquista nova, nao ha festa", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(pagina());

      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Começar treino" });

      expect(screen.queryByLabelText("Conquista nova")).not.toBeInTheDocument();
    });

    it("mostra o proximo marco", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          resumo: {
            ...pagina().resumo,
            conquistas: {
              novas: [],
              total: 2,
              proximo: { code: "DIAS_10", nome: "10 dias de treino", progresso: 4, alvo: 10 },
            },
          },
        }),
      );

      render(<PontoScreen />);

      expect(await screen.findByText("2 marcos")).toBeInTheDocument();
      expect(screen.getByText("4/10")).toBeInTheDocument();
    });

    it("o convite de recomeco aparece no 1o do mes", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ resumo: { ...pagina().resumo, freshStart: "MES" } }),
      );

      render(<PontoScreen />);

      expect(await screen.findByText(/Mês novo/)).toBeInTheDocument();
    });
  });

  describe("troca da meta semanal", () => {
    it("manda a meta nova e recarrega os numeros do servidor", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(pagina());
      vi.mocked(alterarMeta).mockResolvedValue({
        meta: 3,
        metaAgendada: { meta: 5, validaDe: "2026-08-31" },
      });

      render(<PontoScreen />);
      await screen.findByLabelText("Meta da semana");
      vi.mocked(buscarSessoes).mockClear();

      await userEvent.selectOptions(screen.getByRole("combobox"), "5");

      expect(alterarMeta).toHaveBeenCalledWith("tok", 5);
      // Recarrega: so o servidor sabe a partir de qual semana a meta vale.
      await waitFor(() => expect(buscarSessoes).toHaveBeenCalled());
    });

    it("mostra o erro do servidor sem derrubar a tela", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(pagina());
      vi.mocked(alterarMeta).mockRejectedValue(
        new ApiError("A meta tem de ser de 3 a 6 treinos por semana"),
      );

      render(<PontoScreen />);
      await screen.findByLabelText("Meta da semana");

      await userEvent.selectOptions(screen.getByRole("combobox"), "6");

      expect(
        await screen.findByText("A meta tem de ser de 3 a 6 treinos por semana"),
      ).toBeInTheDocument();
    });
  });

  describe("numeros vem do servidor", () => {
    it("exibe os numeros da semana sem recalcular no cliente", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 95 })],
          resumo: {
            emAndamento: null,
            streak: 4,
            recordeDiario: 9,
            semana: { treinos: 3, minutos: 195 },
            meta: meta({ treinos: 3, faltam: 0, cumprida: true, streakSemanas: 5 }),
            conquistas: SEM_CONQUISTAS,
            freshStart: null,
            regras: REGRAS,
          },
        }),
      );

      render(<PontoScreen />);

      const card = await screen.findByLabelText("Meta da semana");
      expect(within(card).getByText("5")).toBeInTheDocument();
      expect(within(card).getByText("semanas seguidas")).toBeInTheDocument();
      expect(within(card).getByText("3h 15min")).toBeInTheDocument();
      // A streak diaria vira recorde: comemora o feito, nao cobra o de hoje.
      expect(within(card).getByText(/Recorde: 9 dias seguidos/)).toBeInTheDocument();
    });

    it("mostra 'treino em andamento' quando o servidor diz que ha sessao aberta", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          resumo: {
            emAndamento: sessao({
              dayKey: CHAVE_HOJE,
              status: "OPEN",
              endedAt: null,
              durationMin: null,
            }),
            streak: 1,
            recordeDiario: 1,
            semana: { treinos: 0, minutos: 0 },
            meta: meta(),
            conquistas: SEM_CONQUISTAS,
            freshStart: null,
            regras: REGRAS,
          },
        }),
      );

      render(<PontoScreen />);

      expect(await screen.findByText(/Treino em andamento desde/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Finalizar treino" })).toBeInTheDocument();
    });

    it("fora do treino, o botao convida a comecar", async () => {
      render(<PontoScreen />);

      expect(await screen.findByRole("button", { name: "Começar treino" })).toBeInTheDocument();
      expect(screen.getByText("Fora do treino")).toBeInTheDocument();
    });
  });

  describe("botao de treino", () => {
    it("alterna e recarrega, porque os numeros mudam no servidor", async () => {
      vi.mocked(alternarTreino).mockResolvedValue(
        sessao({ dayKey: CHAVE_HOJE, status: "OPEN", endedAt: null, durationMin: null }),
      );
      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Começar treino" });

      await userEvent.click(screen.getByRole("button", { name: "Começar treino" }));

      await waitFor(() => expect(alternarTreino).toHaveBeenCalledWith("tok"));
      // 1 no carregamento inicial + 1 depois do toggle
      expect(vi.mocked(buscarSessoes).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("mostra o erro do cooldown vindo do servidor", async () => {
      vi.mocked(alternarTreino).mockRejectedValue(
        new ApiError("Aguarde 25 min para iniciar outro treino"),
      );
      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Começar treino" });

      await userEvent.click(screen.getByRole("button", { name: "Começar treino" }));

      expect(await screen.findByText(/Aguarde 25 min/)).toBeInTheDocument();
    });

    it("reabilita o botao depois de um erro", async () => {
      vi.mocked(alternarTreino).mockRejectedValue(new ApiError("Falhou"));
      render(<PontoScreen />);
      await screen.findByRole("button", { name: "Começar treino" });

      await userEvent.click(screen.getByRole("button", { name: "Começar treino" }));
      await screen.findByText("Falhou");

      expect(screen.getByRole("button", { name: "Começar treino" })).toBeEnabled();
    });
  });

  describe("historico", () => {
    it("mostra a sessao com horario de inicio, fim e duracao", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 90 })] }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(await screen.findByText("1h 30min")).toBeInTheDocument();
      // Pelo papel, nao pelo texto: "Hoje" tambem e o nome da aba, e
      // getByText acharia os dois.
      expect(
        screen.getByRole("heading", { name: "Hoje", level: 3 }),
      ).toBeInTheDocument();
    });

    it("NAO existe mais botao de excluir (historico apagavel inviabiliza placar)", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE })] }),
      );

      render(<PontoScreen />);
      await irParaHistorico();
      await screen.findByText("1h 0min");

      expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
    });

    it("sessao curta aparece marcada como nao contavel", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [
            sessao({
              dayKey: CHAVE_HOJE,
              status: "SHORT",
              durationMin: 5,
              contavel: false,
            }),
          ],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(await screen.findByText(/Abaixo de 20 min/)).toBeInTheDocument();
      expect(screen.getByText("5min")).toBeInTheDocument();
    });

    it("sessao esquecida mostra 'nao finalizado', nunca as 6h gravadas", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [
            sessao({
              dayKey: CHAVE_HOJE,
              status: "AUTO_CLOSED",
              durationMin: 360,
              contavel: false,
            }),
          ],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(await screen.findByText("nao finalizado")).toBeInTheDocument();
      expect(screen.queryByText("6h 0min")).not.toBeInTheDocument();
      expect(screen.getByText(/faltou finalizar/)).toBeInTheDocument();
    });

    it("agrupa por dia usando o dayKey do servidor", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [
            sessao({ dayKey: CHAVE_HOJE, id: "a" }),
            sessao({ dayKey: "2026-01-15", id: "b" }),
          ],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(
        await screen.findByRole("heading", { name: "Hoje", level: 3 }),
      ).toBeInTheDocument();
      expect(screen.getByText("15/01/2026")).toBeInTheDocument();
    });

    it("nao mostra botao de corrigir em sessao aberta", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [
            sessao({
              dayKey: CHAVE_HOJE,
              status: "OPEN",
              endedAt: null,
              durationMin: null,
            }),
          ],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();
      await screen.findByText("em andamento");

      expect(screen.queryByRole("button", { name: "Corrigir treino" })).not.toBeInTheDocument();
    });

    it("esconde o lapis quando o treino ja gastou a sua correcao", async () => {
      // Sao uma correcao por treino, e quem diz se ainda cabe e o servidor
      // (campo `corrigivel`) -- a tela nao reimplementa a regra.
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 60, corrigivel: false })],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();
      await screen.findByText("1h 0min");

      expect(screen.queryByRole("button", { name: "Corrigir treino" })).not.toBeInTheDocument();
    });

    it("mostra o lapis enquanto o treino ainda e corrigivel", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 60, corrigivel: true })],
        }),
      );

      render(<PontoScreen />);
      await irParaHistorico();

      expect(
        await screen.findByRole("button", { name: "Corrigir treino" }),
      ).toBeInTheDocument();
    });
  });

  describe("paginacao", () => {
    it("sem cursor, nao oferece carregar mais", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE })], proximoCursor: null }),
      );

      render(<PontoScreen />);
      await irParaHistorico();
      await screen.findByText("1h 0min");

      expect(screen.queryByRole("button", { name: /Carregar mais/ })).not.toBeInTheDocument();
    });

    it("carrega a proxima pagina e acumula sem repetir", async () => {
      vi.mocked(buscarSessoes)
        .mockResolvedValueOnce(
          pagina({
            itens: [sessao({ dayKey: CHAVE_HOJE, id: "p1", durationMin: 60 })],
            proximoCursor: "cursor-1",
          }),
        )
        .mockResolvedValueOnce(
          pagina({
            itens: [sessao({ dayKey: "2026-01-15", id: "p2", durationMin: 45 })],
            proximoCursor: null,
          }),
        );

      render(<PontoScreen />);
      await irParaHistorico();
      await userEvent.click(await screen.findByRole("button", { name: /Carregar mais/ }));

      await waitFor(() => {
        expect(buscarSessoes).toHaveBeenLastCalledWith("tok", { cursor: "cursor-1" });
      });
      // Os dois itens ficam na tela; o botao desaparece no fim da lista.
      expect(await screen.findByText("45min")).toBeInTheDocument();
      expect(screen.getByText("1h 0min")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Carregar mais/ })).not.toBeInTheDocument();
    });
  });

  describe("correcao auditada", () => {
    async function abrirFormulario() {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, id: "s1", durationMin: 10, status: "SHORT", contavel: false })] }),
      );
      render(<PontoScreen />);
      await irParaHistorico();
      await userEvent.click(await screen.findByRole("button", { name: "Corrigir treino" }));
    }

    it("o motivo e obrigatorio: sem ele nao da pra salvar", async () => {
      await abrirFormulario();

      expect(screen.getByRole("button", { name: "Salvar correcao" })).toBeDisabled();
    });

    it("com motivo preenchido, envia a correcao e recarrega", async () => {
      vi.mocked(corrigirSessao).mockResolvedValue(
        sessao({ dayKey: CHAVE_HOJE, id: "s1", durationMin: 60 }),
      );
      await abrirFormulario();

      await userEvent.type(
        screen.getByPlaceholderText(/esqueci de finalizar/i),
        "Esqueci de finalizar",
      );
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      await waitFor(() => {
        expect(corrigirSessao).toHaveBeenCalledWith(
          "tok",
          "s1",
          expect.objectContaining({ reason: "Esqueci de finalizar" }),
        );
      });
    });

    it("manda o fim em ISO, nao o texto do input", async () => {
      vi.mocked(corrigirSessao).mockResolvedValue(sessao({ dayKey: CHAVE_HOJE, id: "s1" }));
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Motivo ok");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      await waitFor(() => expect(corrigirSessao).toHaveBeenCalled());
      const enviado = vi.mocked(corrigirSessao).mock.calls[0][2];
      expect(enviado.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    });

    it("mostra o erro do servidor quando a correcao e recusada", async () => {
      vi.mocked(corrigirSessao).mockRejectedValue(
        new ApiError("Nao da pra registrar treino no futuro"),
      );
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Tentativa");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      expect(await screen.findByText(/treino no futuro/)).toBeInTheDocument();
    });

    it("confirma na tela que deu certo, dizendo o resultado", async () => {
      // Antes nao havia retorno nenhum: a pessoa corrigia e ficava sem saber se
      // funcionou.
      vi.mocked(corrigirSessao).mockResolvedValue(
        sessao({ dayKey: CHAVE_HOJE, id: "s1", durationMin: 55, contavel: true }),
      );
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Esqueci");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Treino corrigido: 55min, contando na semana.",
      );
      // E o formulario fecha.
      expect(screen.getByRole("button", { name: "Corrigir treino" })).toBeInTheDocument();
    });

    it("avisa quando a correcao foi aceita mas o treino continua nao contando", async () => {
      vi.mocked(corrigirSessao).mockResolvedValue(
        sessao({ dayKey: CHAVE_HOJE, id: "s1", durationMin: 5, status: "SHORT", contavel: false }),
      );
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Ajuste");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      expect(await screen.findByRole("status")).toHaveTextContent(/nao conta na semana/);
    });

    it("mostra o erro DENTRO do formulario e mantem o que foi digitado", async () => {
      // O erro ia pro topo do card, que em celular costuma estar fora da tela
      // quando se esta digitando -- parecia que nada tinha acontecido.
      vi.mocked(corrigirSessao).mockRejectedValue(
        new ApiError("O fim tem de estar dentro de 6h do inicio do treino"),
      );
      await abrirFormulario();

      const campoMotivo = screen.getByPlaceholderText(/esqueci de finalizar/i);
      await userEvent.type(campoMotivo, "Motivo que quero manter");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent("dentro de 6h do inicio");

      // O formulario continua aberto, com o motivo preservado.
      expect(screen.getByPlaceholderText(/esqueci de finalizar/i)).toHaveValue(
        "Motivo que quero manter",
      );
      expect(screen.queryByRole("button", { name: "Corrigir treino" })).not.toBeInTheDocument();
    });

    it("mostra 'Salvando...' enquanto a correcao esta em voo", async () => {
      let liberar: (s: Sessao) => void = () => {};
      vi.mocked(corrigirSessao).mockImplementation(
        () => new Promise<Sessao>((resolve) => { liberar = resolve; }),
      );
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Esqueci");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      const botao = screen.getByRole("button", { name: "Salvar correcao" });
      expect(botao).toHaveTextContent("Salvando...");
      expect(botao).toBeDisabled();
      // Os campos tambem travam, pra nao editar no meio do envio.
      expect(screen.getByPlaceholderText(/esqueci de finalizar/i)).toBeDisabled();

      liberar(sessao({ dayKey: CHAVE_HOJE, id: "s1", durationMin: 55, contavel: true }));
      await screen.findByRole("status");
    });

    it("erro de rede (sem ApiError) tem mensagem propria", async () => {
      vi.mocked(corrigirSessao).mockRejectedValue(new TypeError("Failed to fetch"));
      await abrirFormulario();

      await userEvent.type(screen.getByPlaceholderText(/esqueci de finalizar/i), "Esqueci");
      await userEvent.click(screen.getByRole("button", { name: "Salvar correcao" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/conexao/i);
    });

    it("cancelar fecha o formulario sem enviar nada", async () => {
      await abrirFormulario();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar correcao" }));

      expect(corrigirSessao).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Corrigir treino" })).toBeInTheDocument();
    });
  });

  // Estes dois casos faltavam e o buraco apareceu em teste de mutacao: dava
  // pra quebrar o router inteiro -- ignorar o hash na abertura -- e a suite
  // seguia verde, porque todo teste comecava na aba inicial e navegava por
  // clique. Clicar em aba e so metade do que um router faz.
  describe("a URL manda na aba", () => {
    it("abre direto na aba que a URL pede", async () => {
      // `replaceState` em vez de atribuir o hash: atribuir enfileira um
      // `hashchange` que chega DEPOIS da montagem, e ai o teste passaria pelo
      // ouvinte do evento em vez da leitura inicial -- provando outra coisa.
      window.history.replaceState(null, "", "#/historico");
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 90 })] }),
      );

      render(<PontoScreen />);

      // Sem nenhum clique: a lista tem de estar na tela.
      expect(await screen.findByText("1h 30min")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Histórico" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("o botao voltar do aparelho troca de aba", async () => {
      render(<PontoScreen />);
      await irParaPerfil();
      expect(await screen.findByText("Fulano de Souza")).toBeInTheDocument();

      // Voltar no navegador nao passa pelo React: ele muda o hash e dispara
      // `hashchange`. Se a tela nao ouvir, o botao voltar sai do app inteiro.
      await act(async () => {
        window.location.hash = "#/hoje";
      });

      expect(await screen.findByText("Fora do treino")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("hash desconhecido nao deixa a tela em branco", async () => {
      // Link velho, favorito, PWA reabrindo com hash de uma versao anterior.
      window.history.replaceState(null, "", "#/grupo");

      render(<PontoScreen />);

      expect(await screen.findByText("Fora do treino")).toBeInTheDocument();
    });
  });

  describe("cabecalho e aba Perfil", () => {
    it("mostra o Painel so quando recebe onOpenAdmin", async () => {
      const { unmount } = render(<PontoScreen />);
      await irParaPerfil();
      await screen.findByText("Fulano de Souza");
      expect(screen.queryByRole("button", { name: /Painel/ })).not.toBeInTheDocument();
      unmount();

      const onOpenAdmin = vi.fn();
      render(<PontoScreen onOpenAdmin={onOpenAdmin} />);
      await irParaPerfil();
      await userEvent.click(await screen.findByRole("button", { name: /Painel/ }));

      expect(onOpenAdmin).toHaveBeenCalled();
    });

    it("o botao sair chama logout", async () => {
      render(<PontoScreen />);
      await irParaPerfil();
      await userEvent.click(await screen.findByRole("button", { name: /Sair/ }));

      expect(logout).toHaveBeenCalled();
    });

    // O nome completo era abreviado porque "Sair (Fulano de Souza)" ocupava
    // metade da largura do cabecalho no iPhone. Na aba Perfil ha largura
    // sobrando, e abreviar ali seria esconder informacao sem motivo.
    it("a aba Perfil mostra o nome completo, nao o primeiro nome", async () => {
      render(<PontoScreen />);
      await irParaPerfil();

      expect(await screen.findByText("Fulano de Souza")).toBeInTheDocument();
      expect(screen.getByText("f@x.com")).toBeInTheDocument();
    });

    it("Sair e Painel NAO ficam mais no cabecalho, a um toque do botao de treino", async () => {
      // Sair obriga a logar de novo: alvo pequeno no topo, colado na acao mais
      // usada do app, era toque errado esperando acontecer.
      render(<PontoScreen onOpenAdmin={vi.fn()} />);
      await screen.findByText("Fora do treino");

      expect(screen.queryByRole("button", { name: /Sair/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Painel/ })).not.toBeInTheDocument();
    });

    it("o botao de tema alterna entre claro e escuro", async () => {
      // Sao dois estados na tela: o botao mostra o tema que o toque aplica.
      render(<PontoScreen />);
      await screen.findByText("Fora do treino");

      await userEvent.click(
        screen.getByRole("button", { name: "Mudar para o tema escuro" }),
      );
      expect(document.documentElement.dataset.tema).toBe("escuro");

      await userEvent.click(
        screen.getByRole("button", { name: "Mudar para o tema claro" }),
      );
      expect(document.documentElement.dataset.tema).toBeUndefined();
    });
  });

  it("a sessao contavel nao ganha o aviso de 'nao conta'", async () => {
    vi.mocked(buscarSessoes).mockResolvedValue(
      pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 60 })] }),
    );

    render(<PontoScreen />);
    await irParaHistorico();
    const linha = (await screen.findByText("1h 0min")).closest("li")!;

    expect(within(linha).queryByText(/nao conta/)).not.toBeInTheDocument();
  });
});
