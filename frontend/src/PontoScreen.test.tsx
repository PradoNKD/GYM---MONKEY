import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PontoScreen } from "./PontoScreen";
import { ApiError } from "./api";
import type { PaginaSessoes, Sessao, StatusSessao } from "./types";

const logout = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    token: "tok",
    user: { id: "u1", name: "Fulano", email: "f@x.com", role: "USER" },
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
  };
});

const { buscarSessoes, alternarTreino, corrigirSessao } = await import("./api");

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
    contavel: over.contavel ?? status === "COMPLETED",
  };
}

function pagina(over: Partial<PaginaSessoes> = {}): PaginaSessoes {
  return {
    itens: over.itens ?? [],
    proximoCursor: over.proximoCursor ?? null,
    resumo: {
      emAndamento: null,
      streak: 0,
      semana: { treinos: 0, minutos: 0 },
      regras: { duracaoMinimaMin: 20 },
      ...over.resumo,
    },
  };
}

const hoje = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const CHAVE_HOJE = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

describe("PontoScreen (sessoes)", () => {
  beforeEach(() => {
    vi.mocked(buscarSessoes).mockReset().mockResolvedValue(pagina());
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

  describe("numeros vem do servidor", () => {
    it("exibe streak e resumo semanal sem recalcular no cliente", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({
          itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 95 })],
          resumo: {
            emAndamento: null,
            streak: 4,
            semana: { treinos: 3, minutos: 195 },
            regras: { duracaoMinimaMin: 20 },
          },
        }),
      );

      render(<PontoScreen />);

      expect(await screen.findByText("4")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("3h 15min")).toBeInTheDocument();
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
            semana: { treinos: 0, minutos: 0 },
            regras: { duracaoMinimaMin: 20 },
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

      expect(await screen.findByText("1h 30min")).toBeInTheDocument();
      expect(screen.getByText("Hoje")).toBeInTheDocument();
    });

    it("NAO existe mais botao de excluir (historico apagavel inviabiliza placar)", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE })] }),
      );

      render(<PontoScreen />);
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

      expect(await screen.findByText("Hoje")).toBeInTheDocument();
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
      await screen.findByText("em andamento");

      expect(screen.queryByRole("button", { name: "Corrigir treino" })).not.toBeInTheDocument();
    });
  });

  describe("paginacao", () => {
    it("sem cursor, nao oferece carregar mais", async () => {
      vi.mocked(buscarSessoes).mockResolvedValue(
        pagina({ itens: [sessao({ dayKey: CHAVE_HOJE })], proximoCursor: null }),
      );

      render(<PontoScreen />);
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

    it("cancelar fecha o formulario sem enviar nada", async () => {
      await abrirFormulario();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar correcao" }));

      expect(corrigirSessao).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Corrigir treino" })).toBeInTheDocument();
    });
  });

  describe("cabecalho", () => {
    it("mostra o Painel so quando recebe onOpenAdmin", async () => {
      const { unmount } = render(<PontoScreen />);
      await screen.findByText("Fora do treino");
      expect(screen.queryByRole("button", { name: /Painel/ })).not.toBeInTheDocument();
      unmount();

      const onOpenAdmin = vi.fn();
      render(<PontoScreen onOpenAdmin={onOpenAdmin} />);
      await userEvent.click(await screen.findByRole("button", { name: /Painel/ }));

      expect(onOpenAdmin).toHaveBeenCalled();
    });

    it("o botao sair chama logout", async () => {
      render(<PontoScreen />);
      await userEvent.click(await screen.findByRole("button", { name: /Sair/ }));

      expect(logout).toHaveBeenCalled();
    });
  });

  it("a sessao contavel nao ganha o aviso de 'nao conta'", async () => {
    vi.mocked(buscarSessoes).mockResolvedValue(
      pagina({ itens: [sessao({ dayKey: CHAVE_HOJE, durationMin: 60 })] }),
    );

    render(<PontoScreen />);
    const linha = (await screen.findByText("1h 0min")).closest("li")!;

    expect(within(linha).queryByText(/nao conta/)).not.toBeInTheDocument();
  });
});
