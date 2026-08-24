import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminScreen } from "./AdminScreen";
import { ApiError } from "./api";
import type { UsuarioAdmin } from "./types";

const logout = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    token: "sup-token",
    user: { id: "sup-1", name: "Chefe", email: "chefe@x.com", role: "SUPERVISOR" },
    logout,
    login: vi.fn(),
    cadastrar: vi.fn(),
  }),
}));

vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return { ...real, listarUsuarios: vi.fn(), atualizarUsuario: vi.fn() };
});

const { listarUsuarios, atualizarUsuario } = await import("./api");

function u(over: Partial<UsuarioAdmin>): UsuarioAdmin {
  return {
    id: "u1",
    name: "Fulano",
    email: "fulano@x.com",
    role: "USER",
    active: true,
    createdAt: "2026-08-24T10:00:00.000Z",
    ...over,
  };
}

describe("AdminScreen", () => {
  beforeEach(() => {
    vi.mocked(listarUsuarios).mockReset();
    vi.mocked(atualizarUsuario).mockReset();
    logout.mockReset();
  });

  it("carrega e separa pendentes de ativos", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      u({ id: "sup-1", name: "Chefe", email: "chefe@x.com", role: "SUPERVISOR", active: true }),
      u({ id: "p1", name: "Pendente", email: "p@x.com", active: false }),
    ]);

    render(<AdminScreen onBack={vi.fn()} />);

    expect(await screen.findByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText(/Aguardando aprovacao/)).toBeInTheDocument();
    expect(listarUsuarios).toHaveBeenCalledWith("sup-token");
  });

  it("aprova um pendente e atualiza a lista", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      u({ id: "p1", name: "Pendente", email: "p@x.com", active: false }),
    ]);
    vi.mocked(atualizarUsuario).mockResolvedValue(
      u({ id: "p1", name: "Pendente", email: "p@x.com", active: true }),
    );

    render(<AdminScreen onBack={vi.fn()} />);
    await screen.findByText("Pendente");

    await userEvent.click(screen.getByRole("button", { name: /Aprovar/ }));

    await waitFor(() => {
      expect(atualizarUsuario).toHaveBeenCalledWith("sup-token", "p1", { active: true });
    });
  });

  it("desativa um usuario ativo", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      u({ id: "a1", name: "Ativo", email: "a@x.com", active: true }),
    ]);
    vi.mocked(atualizarUsuario).mockResolvedValue(
      u({ id: "a1", name: "Ativo", email: "a@x.com", active: false }),
    );

    render(<AdminScreen onBack={vi.fn()} />);
    await screen.findByText("Ativo");

    await userEvent.click(screen.getByRole("button", { name: /Desativar/ }));

    await waitFor(() => {
      expect(atualizarUsuario).toHaveBeenCalledWith("sup-token", "a1", { active: false });
    });
  });

  it("nao deixa o supervisor se desativar (botao desabilitado na propria linha)", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      u({ id: "sup-1", name: "Chefe", email: "chefe@x.com", role: "SUPERVISOR", active: true }),
    ]);

    render(<AdminScreen onBack={vi.fn()} />);
    const linha = (await screen.findByText("Chefe")).closest("li")!;

    expect(within(linha).getByRole("button", { name: /Desativar/ })).toBeDisabled();
    expect(within(linha).getByText("voce")).toBeInTheDocument();
  });

  it("promove um usuario a supervisor", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      u({ id: "u2", name: "Comum", email: "c@x.com", role: "USER", active: true }),
    ]);
    vi.mocked(atualizarUsuario).mockResolvedValue(
      u({ id: "u2", name: "Comum", email: "c@x.com", role: "SUPERVISOR", active: true }),
    );

    render(<AdminScreen onBack={vi.fn()} />);
    await screen.findByText("Comum");

    await userEvent.click(screen.getByRole("button", { name: /Tornar supervisor/ }));

    await waitFor(() => {
      expect(atualizarUsuario).toHaveBeenCalledWith("sup-token", "u2", {
        role: "SUPERVISOR",
      });
    });
  });

  it("mostra erro quando a listagem falha", async () => {
    vi.mocked(listarUsuarios).mockRejectedValue(new ApiError("Acesso restrito a supervisores"));

    render(<AdminScreen onBack={vi.fn()} />);

    expect(
      await screen.findByText("Acesso restrito a supervisores"),
    ).toBeInTheDocument();
  });

  it("o botao voltar chama onBack", async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([]);
    const onBack = vi.fn();

    render(<AdminScreen onBack={onBack} />);
    await userEvent.click(await screen.findByRole("button", { name: /Voltar/ }));

    expect(onBack).toHaveBeenCalled();
  });
});
