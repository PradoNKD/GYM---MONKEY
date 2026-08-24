import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...real,
    entrar: vi.fn(),
    registrar: vi.fn(),
  };
});

const { entrar, registrar, ApiError } = await import("./api");

const STORAGE_KEY = "gym-monkey.auth";

const usuario = {
  id: "user-1",
  name: "Fulano",
  email: "fulano@example.com",
  role: "USER" as const,
};

function Sonda() {
  const { token, user, login, cadastrar, logout } = useAuth();
  const [erro, setErro] = useState<string | null>(null);

  // O AuthScreen real envolve login/cadastrar em try/catch; a sonda faz o
  // mesmo para que uma rejeicao esperada nao vire unhandled rejection.
  const capturando = (acao: () => Promise<unknown>) => async () => {
    try {
      await acao();
    } catch (error) {
      setErro((error as Error).message);
    }
  };

  return (
    <div>
      <span data-testid="token">{token ?? "sem-token"}</span>
      <span data-testid="user">{user?.name ?? "sem-user"}</span>
      <span data-testid="erro">{erro ?? "sem-erro"}</span>
      <button onClick={capturando(() => login("fulano@example.com", "senha1234"))}>
        entrar
      </button>
      <button
        onClick={capturando(() => cadastrar("Fulano", "fulano@example.com", "senha1234"))}
      >
        cadastrar
      </button>
      <button onClick={logout}>sair</button>
    </div>
  );
}

function renderizar() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(entrar).mockReset();
    vi.mocked(registrar).mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("estado inicial", () => {
    it("comeca sem sessao quando o localStorage esta vazio", () => {
      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(screen.getByTestId("user")).toHaveTextContent("sem-user");
    });

    it("restaura a sessao salva no localStorage", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: "token-salvo", user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("token-salvo");
      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");
    });

    it("ignora json corrompido no localStorage em vez de quebrar a tela", () => {
      localStorage.setItem(STORAGE_KEY, "{isso-nao-e-json");

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
    });

    it("nao le a chave antiga gyn-monkey.auth", () => {
      localStorage.setItem(
        "gyn-monkey.auth",
        JSON.stringify({ token: "token-antigo", user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
    });
  });

  describe("login", () => {
    it("guarda token e usuario no estado e no localStorage", async () => {
      vi.mocked(entrar).mockResolvedValue({ accessToken: "token-novo", user: usuario });
      renderizar();

      await userEvent.click(screen.getByText("entrar"));

      await waitFor(() => {
        expect(screen.getByTestId("token")).toHaveTextContent("token-novo");
      });
      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
        token: "token-novo",
        user: usuario,
      });
    });

    it("repassa o erro da API e nao cria sessao", async () => {
      vi.mocked(entrar).mockRejectedValue(new ApiError("E-mail ou senha invalidos"));
      renderizar();

      await userEvent.click(screen.getByText("entrar"));

      await waitFor(() => {
        expect(screen.getByTestId("erro")).toHaveTextContent(
          "E-mail ou senha invalidos",
        );
      });
      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("cadastro", () => {
    it("NAO loga apos criar a conta (fica pendente de aprovacao)", async () => {
      vi.mocked(registrar).mockResolvedValue({
        status: "pending_approval",
        message: "Conta criada! Aguarde aprovacao.",
      });
      renderizar();

      await userEvent.click(screen.getByText("cadastrar"));

      // registrar foi chamado, mas nenhuma sessao foi criada.
      await waitFor(() => {
        expect(vi.mocked(registrar)).toHaveBeenCalled();
      });
      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("logout", () => {
    it("limpa o estado e remove a sessao do localStorage", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: "token-salvo", user: usuario }),
      );
      renderizar();
      expect(screen.getByTestId("token")).toHaveTextContent("token-salvo");

      await userEvent.click(screen.getByText("sair"));

      await waitFor(() => {
        expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("useAuth fora do provider", () => {
    it("lanca erro explicativo", () => {
      // Silencia o error boundary do React no console durante este teste
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => render(<Sonda />)).toThrow(
        "useAuth deve ser usado dentro de um AuthProvider",
      );

      spy.mockRestore();
    });
  });
});
