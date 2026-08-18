import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";
import { ApiError } from "./api";

const login = vi.fn();
const cadastrar = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ login, cadastrar, token: null, user: null, logout: vi.fn() }),
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    login.mockReset().mockResolvedValue(undefined);
    cadastrar.mockReset().mockResolvedValue(undefined);
  });

  describe("modo login (padrao)", () => {
    it("abre em login, sem o campo de nome", () => {
      render(<AuthScreen />);

      expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Nome")).not.toBeInTheDocument();
    });

    it("chama login com e-mail e senha digitados", async () => {
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "fulano@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "senha1234");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

      await waitFor(() => {
        expect(login).toHaveBeenCalledWith("fulano@example.com", "senha1234");
      });
      expect(cadastrar).not.toHaveBeenCalled();
    });

    it("nao exige senha forte no login (quem ja tem conta antiga consegue entrar)", () => {
      render(<AuthScreen />);

      const senha = screen.getByPlaceholderText("Senha");
      expect(senha).not.toHaveAttribute("minLength");
      expect(senha).not.toHaveAttribute("pattern");
    });
  });

  describe("alternancia entre login e cadastro", () => {
    it("mostra o campo de nome ao trocar para cadastro", async () => {
      render(<AuthScreen />);

      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));

      expect(screen.getByPlaceholderText("Nome")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    });

    it("volta para login ao clicar de novo", async () => {
      render(<AuthScreen />);

      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));
      await userEvent.click(screen.getByText("Ja tem conta? Entrar"));

      expect(screen.queryByPlaceholderText("Nome")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    });

    it("limpa a mensagem de erro ao trocar de modo", async () => {
      login.mockRejectedValue(new ApiError("E-mail ou senha invalidos"));
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "f@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "errada12");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
      expect(await screen.findByText("E-mail ou senha invalidos")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));

      expect(screen.queryByText("E-mail ou senha invalidos")).not.toBeInTheDocument();
    });
  });

  describe("modo cadastro", () => {
    it("chama cadastrar com nome, e-mail e senha", async () => {
      render(<AuthScreen />);
      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));

      await userEvent.type(screen.getByPlaceholderText("Nome"), "Fulano");
      await userEvent.type(screen.getByPlaceholderText("E-mail"), "fulano@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "senha1234");
      await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

      await waitFor(() => {
        expect(cadastrar).toHaveBeenCalledWith(
          "Fulano",
          "fulano@example.com",
          "senha1234",
        );
      });
      expect(login).not.toHaveBeenCalled();
    });

    it("exige senha com no minimo 8 caracteres, letra e numero (espelha o backend)", async () => {
      render(<AuthScreen />);
      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));

      const senha = screen.getByPlaceholderText("Senha");
      expect(senha).toHaveAttribute("minLength", "8");
      expect(senha).toHaveAttribute("pattern", "(?=.*[A-Za-z])(?=.*\\d).+");
    });

    it("mostra a dica de senha", async () => {
      render(<AuthScreen />);
      await userEvent.click(screen.getByText("Nao tem conta? Cadastre-se"));

      expect(
        screen.getByText("Minimo 8 caracteres, com letra e numero"),
      ).toBeInTheDocument();
    });
  });

  describe("tratamento de erro", () => {
    it("mostra a mensagem vinda da API", async () => {
      login.mockRejectedValue(new ApiError("E-mail ou senha invalidos"));
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "f@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "errada12");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

      expect(await screen.findByText("E-mail ou senha invalidos")).toBeInTheDocument();
    });

    it("usa mensagem genarica quando o erro nao e da API (servidor fora do ar)", async () => {
      login.mockRejectedValue(new TypeError("Failed to fetch"));
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "f@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "senha1234");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

      expect(
        await screen.findByText("Nao foi possivel conectar ao servidor"),
      ).toBeInTheDocument();
    });

    it("reabilita o botao depois de um erro, permitindo nova tentativa", async () => {
      login.mockRejectedValue(new ApiError("E-mail ou senha invalidos"));
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "f@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "errada12");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

      await screen.findByText("E-mail ou senha invalidos");
      expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    });
  });

  describe("estado de carregando", () => {
    it("desabilita o botao e mostra 'Aguarde...' durante o envio", async () => {
      let liberar: () => void = () => {};
      login.mockImplementation(
        () => new Promise<void>((resolve) => { liberar = resolve; }),
      );
      render(<AuthScreen />);

      await userEvent.type(screen.getByPlaceholderText("E-mail"), "f@example.com");
      await userEvent.type(screen.getByPlaceholderText("Senha"), "senha1234");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

      const botao = await screen.findByRole("button", { name: "Aguarde..." });
      expect(botao).toBeDisabled();

      liberar();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
      });
    });
  });
});
