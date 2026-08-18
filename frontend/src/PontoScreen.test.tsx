import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PontoScreen } from "./PontoScreen";
import { ApiError } from "./api";
import type { Registro, TipoRegistro } from "./types";

const logout = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    token: "token-de-teste",
    user: { id: "user-1", name: "Fulano", email: "fulano@example.com" },
    logout,
    login: vi.fn(),
    cadastrar: vi.fn(),
  }),
}));

vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...real,
    buscarHistorico: vi.fn(),
    alternarPonto: vi.fn(),
    editarRegistro: vi.fn(),
    excluirRegistro: vi.fn(),
  };
});

const { buscarHistorico, alternarPonto, editarRegistro, excluirRegistro } =
  await import("./api");

function registro(id: string, type: TipoRegistro, data: Date): Registro {
  return { id, type, timestamp: data.toISOString(), userId: "user-1" };
}

function hojeAs(hora: number, minuto = 0): Date {
  const data = new Date();
  data.setHours(hora, minuto, 0, 0);
  return data;
}

describe("PontoScreen", () => {
  beforeEach(() => {
    vi.mocked(buscarHistorico).mockReset().mockResolvedValue([]);
    vi.mocked(alternarPonto).mockReset();
    vi.mocked(editarRegistro).mockReset();
    vi.mocked(excluirRegistro).mockReset();
    logout.mockReset();
    vi.unstubAllGlobals();
  });

  describe("carregamento inicial", () => {
    it("busca o historico com o token do usuario", async () => {
      render(<PontoScreen />);

      await waitFor(() => {
        expect(buscarHistorico).toHaveBeenCalledWith("token-de-teste");
      });
    });

    it("mantem o botao desabilitado enquanto carrega", () => {
      vi.mocked(buscarHistorico).mockImplementation(() => new Promise(() => {}));
      render(<PontoScreen />);

      expect(screen.getByRole("button", { name: /Começar treino/ })).toBeDisabled();
    });

    it("mostra 'Fora do treino' sem historico e nao inventa horario", async () => {
      render(<PontoScreen />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Começar treino/ })).toBeEnabled();
      });
      expect(screen.getByText("Fora do treino")).toBeInTheDocument();
    });

    it("mostra erro quando a busca falha", async () => {
      vi.mocked(buscarHistorico).mockRejectedValue(new ApiError("Token expirado"));
      render(<PontoScreen />);

      expect(await screen.findByText("Token expirado")).toBeInTheDocument();
    });

    it("usa mensagem genarica quando a falha nao e da API", async () => {
      vi.mocked(buscarHistorico).mockRejectedValue(new TypeError("Failed to fetch"));
      render(<PontoScreen />);

      expect(
        await screen.findByText("Nao foi possivel carregar o historico"),
      ).toBeInTheDocument();
    });
  });

  describe("estado do botao conforme o ultimo registro", () => {
    it("mostra 'Começar treino' quando o ultimo registro foi CHECK_OUT", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("out-1", "CHECK_OUT", hojeAs(11)),
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      expect(
        await screen.findByRole("button", { name: /Começar treino/ }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Fora do treino desde/)).toBeInTheDocument();
    });

    it("mostra 'Finalizar treino' quando ha um CHECK_IN em aberto", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      expect(
        await screen.findByRole("button", { name: /Finalizar treino/ }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Treino em andamento desde/)).toBeInTheDocument();
    });
  });

  describe("registrar ponto", () => {
    it("adiciona o novo registro no topo e vira o botao para 'Finalizar treino'", async () => {
      vi.mocked(alternarPonto).mockResolvedValue(
        registro("novo", "CHECK_IN", hojeAs(10)),
      );
      render(<PontoScreen />);

      const botao = await screen.findByRole("button", { name: /Começar treino/ });
      await userEvent.click(botao);

      expect(
        await screen.findByRole("button", { name: /Finalizar treino/ }),
      ).toBeInTheDocument();
      expect(alternarPonto).toHaveBeenCalledWith("token-de-teste");
    });

    it("mostra 'Registrando...' e desabilita o botao durante o envio", async () => {
      let liberar: (r: Registro) => void = () => {};
      vi.mocked(alternarPonto).mockImplementation(
        () => new Promise<Registro>((resolve) => { liberar = resolve; }),
      );
      render(<PontoScreen />);

      await userEvent.click(
        await screen.findByRole("button", { name: /Começar treino/ }),
      );

      const botao = await screen.findByRole("button", { name: "Registrando..." });
      expect(botao).toBeDisabled();

      liberar(registro("novo", "CHECK_IN", hojeAs(10)));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Finalizar treino/ }),
        ).toBeEnabled();
      });
    });

    it("mostra erro e nao altera o historico quando falha", async () => {
      vi.mocked(alternarPonto).mockRejectedValue(new ApiError("Limite excedido"));
      render(<PontoScreen />);

      await userEvent.click(
        await screen.findByRole("button", { name: /Começar treino/ }),
      );

      expect(await screen.findByText("Limite excedido")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Começar treino/ }),
      ).toBeInTheDocument();
    });
  });

  describe("duracao do treino", () => {
    it("mostra a duracao calculada de uma sessao concluida", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("out-1", "CHECK_OUT", hojeAs(11, 30)),
        registro("in-1", "CHECK_IN", hojeAs(10, 0)),
      ]);
      render(<PontoScreen />);

      await waitFor(() => {
        expect(screen.getAllByText("Duração").length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText("1h 30min").length).toBeGreaterThan(0);
    });

    it("nao mostra duracao para um treino ainda em andamento", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      await screen.findByRole("button", { name: /Finalizar treino/ });
      expect(screen.queryByText("Duração")).not.toBeInTheDocument();
    });
  });

  describe("resumo semanal", () => {
    it("mostra streak de 1 dia no singular quando treinou hoje", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      expect(await screen.findByText("dia seguido")).toBeInTheDocument();
    });

    it("conta os treinos concluidos da semana", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("out-1", "CHECK_OUT", hojeAs(11)),
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      expect(await screen.findByText("treino essa semana")).toBeInTheDocument();
    });
  });

  describe("corrigir registro", () => {
    it("abre o input de data ao clicar em corrigir", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Corrigir registro"))[0],
      );

      expect(screen.getByLabelText("Salvar correcao")).toBeInTheDocument();
      expect(screen.getByLabelText("Cancelar edicao")).toBeInTheDocument();
    });

    it("salva a correcao e reordena o historico", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      vi.mocked(editarRegistro).mockResolvedValue(
        registro("in-1", "CHECK_IN", hojeAs(8)),
      );
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Corrigir registro"))[0],
      );
      await userEvent.click(screen.getByLabelText("Salvar correcao"));

      await waitFor(() => {
        expect(editarRegistro).toHaveBeenCalledWith(
          "token-de-teste",
          "in-1",
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        );
      });
      expect(screen.queryByLabelText("Salvar correcao")).not.toBeInTheDocument();
    });

    it("cancelar fecha a edicao sem chamar a API", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Corrigir registro"))[0],
      );
      await userEvent.click(screen.getByLabelText("Cancelar edicao"));

      expect(screen.queryByLabelText("Salvar correcao")).not.toBeInTheDocument();
      expect(editarRegistro).not.toHaveBeenCalled();
    });

    it("mostra erro e mantem a edicao aberta quando salvar falha", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      vi.mocked(editarRegistro).mockRejectedValue(
        new ApiError("Registro nao encontrado"),
      );
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Corrigir registro"))[0],
      );
      await userEvent.click(screen.getByLabelText("Salvar correcao"));

      expect(await screen.findByText("Registro nao encontrado")).toBeInTheDocument();
      expect(screen.getByLabelText("Salvar correcao")).toBeInTheDocument();
    });
  });

  describe("excluir registro", () => {
    it("pede confirmacao antes de excluir", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      const confirm = vi.fn().mockReturnValue(false);
      vi.stubGlobal("confirm", confirm);
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Excluir registro"))[0],
      );

      expect(confirm).toHaveBeenCalled();
      expect(excluirRegistro).not.toHaveBeenCalled();
    });

    it("remove o registro da tela quando confirmado", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      vi.mocked(excluirRegistro).mockResolvedValue(undefined);
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Excluir registro"))[0],
      );

      await waitFor(() => {
        expect(excluirRegistro).toHaveBeenCalledWith("token-de-teste", "in-1");
      });
      await waitFor(() => {
        expect(screen.queryByLabelText("Excluir registro")).not.toBeInTheDocument();
      });
    });

    it("mostra erro e mantem o registro quando a exclusao falha", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      vi.mocked(excluirRegistro).mockRejectedValue(
        new ApiError("Registro nao encontrado"),
      );
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
      render(<PontoScreen />);

      await userEvent.click(
        (await screen.findAllByLabelText("Excluir registro"))[0],
      );

      expect(await screen.findByText("Registro nao encontrado")).toBeInTheDocument();
      expect(screen.getAllByLabelText("Excluir registro").length).toBeGreaterThan(0);
    });
  });

  describe("sair", () => {
    it("mostra o nome do usuario e chama logout", async () => {
      render(<PontoScreen />);

      const botaoSair = await screen.findByText(/Sair \(Fulano\)/);
      await userEvent.click(botaoSair);

      expect(logout).toHaveBeenCalled();
    });
  });

  describe("historico agrupado por dia", () => {
    function diasAtrasAs(dias: number, hora: number, minuto = 0): Date {
      const data = new Date();
      data.setDate(data.getDate() - dias);
      data.setHours(hora, minuto, 0, 0);
      return data;
    }

    function secaoHistorico() {
      return screen.getByText("Histórico").closest("section")!;
    }

    it("mostra cabecalho 'Hoje' para os registros de hoje", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      await screen.findByRole("button", { name: /Finalizar treino/ });
      expect(within(secaoHistorico()).getByText("Hoje")).toBeInTheDocument();
    });

    it("mostra 'Hoje' e 'Ontem' como grupos separados", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("hoje-1", "CHECK_IN", hojeAs(10)),
        registro("ontem-1", "CHECK_OUT", diasAtrasAs(1, 11)),
        registro("ontem-2", "CHECK_IN", diasAtrasAs(1, 10)),
      ]);
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getByText("Hoje")).toBeInTheDocument();
      });
      expect(within(secao).getByText("Ontem")).toBeInTheDocument();
    });

    it("usa a data em dd/mm/aaaa para dias mais antigos", async () => {
      const antigo = diasAtrasAs(5, 10);
      const dataEsperada = antigo.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("antigo-1", "CHECK_IN", antigo),
      ]);
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getByText(dataEsperada)).toBeInTheDocument();
      });
      expect(within(secao).queryByText("Hoje")).not.toBeInTheDocument();
    });

    it("mostra os grupos do dia mais recente para o mais antigo", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("hoje-1", "CHECK_IN", hojeAs(10)),
        registro("ontem-1", "CHECK_IN", diasAtrasAs(1, 10)),
      ]);
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getByText("Hoje")).toBeInTheDocument();
      });

      const titulos = within(secao)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
      expect(titulos).toEqual(["Hoje", "Ontem"]);
    });

    it("nao mostra nenhum cabecalho de dia quando o historico esta vazio", async () => {
      render(<PontoScreen />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Começar treino/ })).toBeEnabled();
      });
      expect(
        within(secaoHistorico()).queryByRole("heading", { level: 3 }),
      ).not.toBeInTheDocument();
    });

    it("agrupa os registros no dia certo (cada dia com os seus)", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("hoje-in", "CHECK_IN", hojeAs(10)),
        registro("ontem-out", "CHECK_OUT", diasAtrasAs(1, 11)),
        registro("ontem-in", "CHECK_IN", diasAtrasAs(1, 10)),
      ]);
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getByText("Hoje")).toBeInTheDocument();
      });

      // Hoje tem 1 registro (so o inicio); ontem tem 2 (inicio e fim) mais a
      // linha de duracao da sessao concluida.
      const grupos = secao.querySelectorAll(".grupo-dia");
      expect(grupos).toHaveLength(2);
      expect(grupos[0].querySelectorAll(".linha-registro")).toHaveLength(1);
      expect(
        grupos[1].querySelectorAll(".linha-registro:not(.linha-duracao)"),
      ).toHaveLength(2);
    });

    it("mantem a duracao de um treino que atravessa a meia-noite, mesmo em grupos diferentes", async () => {
      const inicio = diasAtrasAs(1, 23, 30);
      const fim = new Date(inicio.getTime() + 60 * 60000);

      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("out-1", "CHECK_OUT", fim),
        registro("in-1", "CHECK_IN", inicio),
      ]);
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getAllByText("Duração").length).toBeGreaterThan(0);
      });
      // Os dois registros caem em dias distintos, mas a duracao continua
      // sendo calculada sobre o historico inteiro.
      expect(secao.querySelectorAll(".grupo-dia")).toHaveLength(2);
      expect(within(secao).getAllByText("1h 0min").length).toBeGreaterThan(0);
    });

    it("reagrupa quando um registro e excluido", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("hoje-in", "CHECK_IN", hojeAs(10)),
        registro("ontem-in", "CHECK_IN", diasAtrasAs(1, 10)),
      ]);
      vi.mocked(excluirRegistro).mockResolvedValue(undefined);
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
      render(<PontoScreen />);

      const secao = secaoHistorico();
      await waitFor(() => {
        expect(within(secao).getByText("Ontem")).toBeInTheDocument();
      });

      // Exclui o registro de hoje: o grupo "Hoje" deve desaparecer.
      const excluirDeHoje = within(
        secao.querySelectorAll(".grupo-dia")[0] as HTMLElement,
      ).getByLabelText("Excluir registro");
      await userEvent.click(excluirDeHoje);

      await waitFor(() => {
        expect(within(secao).queryByText("Hoje")).not.toBeInTheDocument();
      });
      expect(within(secao).getByText("Ontem")).toBeInTheDocument();
    });
  });

  describe("secao Treino Anterior", () => {
    it("nao aparece quando nao ha sessao concluida", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      await screen.findByRole("button", { name: /Finalizar treino/ });
      expect(screen.queryByText("Treino Anterior")).not.toBeInTheDocument();
    });

    it("mostra o inicio e o fim da ultima sessao concluida", async () => {
      vi.mocked(buscarHistorico).mockResolvedValue([
        registro("out-1", "CHECK_OUT", hojeAs(11)),
        registro("in-1", "CHECK_IN", hojeAs(10)),
      ]);
      render(<PontoScreen />);

      const titulo = await screen.findByText("Treino Anterior");
      const secao = titulo.closest("section")!;

      expect(within(secao).getByText("Fim do treino")).toBeInTheDocument();
      expect(within(secao).getByText("Início do treino")).toBeInTheDocument();
    });
  });
});
