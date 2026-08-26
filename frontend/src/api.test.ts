import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alternarTreino,
  ApiError,
  atualizarUsuario,
  buscarSessoes,
  corrigirSessao,
  entrar,
  listarUsuarios,
  registrar,
} from "./api";

const API_URL = "http://localhost:3000";

function respostaOk(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => body,
  } as Response;
}

function respostaErro(body: unknown, status = 400) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

describe("cutover para /sessions", () => {
  it("o modulo nao expoe mais as funcoes de /time-entries", async () => {
    // A tela nao fala mais com as rotas antigas. Elas seguem no ar como
    // auditoria, mas o frontend nao as usa -- e isto impede que voltem sem
    // alguem perceber.
    const api = await import("./api");

    expect(api).not.toHaveProperty("buscarHistorico");
    expect(api).not.toHaveProperty("alternarPonto");
    expect(api).not.toHaveProperty("editarRegistro");
    expect(api).not.toHaveProperty("excluirRegistro");
  });
});

describe("api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("montagem da requisicao", () => {
    it("envia Content-Type json e o corpo serializado no registro", async () => {
      fetchMock.mockResolvedValue(respostaOk({ accessToken: "t", user: {} }));

      await registrar({ name: "Fulano", email: "f@example.com", password: "senha1234" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/auth/register`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Fulano",
            email: "f@example.com",
            password: "senha1234",
          }),
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        }),
      );
    });

    it("nao envia header Authorization quando nao ha token", async () => {
      fetchMock.mockResolvedValue(respostaOk({ accessToken: "t", user: {} }));

      await entrar({ email: "f@example.com", password: "senha1234" });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty("Authorization");
    });

    it("envia Bearer token nas rotas autenticadas", async () => {
      fetchMock.mockResolvedValue(respostaOk({ itens: [] }));

      await buscarSessoes("meu-token");

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/sessions`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer meu-token" }),
        }),
      );
    });

    it("monta a query de paginacao so com o que foi informado", async () => {
      fetchMock.mockResolvedValue(respostaOk({ itens: [] }));

      await buscarSessoes("t", { cursor: "abc", limite: 10 });
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${API_URL}/sessions?cursor=abc&limite=10`,
        expect.anything(),
      );

      await buscarSessoes("t", { cursor: "abc" });
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${API_URL}/sessions?cursor=abc`,
        expect.anything(),
      );
    });

    it("usa POST em /sessions/toggle e NAO manda horario", async () => {
      fetchMock.mockResolvedValue(respostaOk({ id: "1", status: "OPEN" }));

      await alternarTreino("meu-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/sessions/toggle`);
      expect(init.method).toBe("POST");
      // Quem marca o horario e o servidor: nada de timestamp no corpo.
      expect(init.body).toBeUndefined();
    });

    it("usa PATCH com motivo e horario ao corrigir a sessao", async () => {
      fetchMock.mockResolvedValue(respostaOk({ id: "abc" }));

      await corrigirSessao("meu-token", "abc", {
        endedAt: "2026-08-26T14:00:00.000Z",
        reason: "Esqueci de finalizar",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/sessions/abc`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            endedAt: "2026-08-26T14:00:00.000Z",
            reason: "Esqueci de finalizar",
          }),
        }),
      );
    });

    it("listarUsuarios: GET /users com Bearer", async () => {
      fetchMock.mockResolvedValue(respostaOk([]));

      await listarUsuarios("sup-token");

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/users`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer sup-token" }),
        }),
      );
    });

    it("atualizarUsuario: PATCH /users/:id com o corpo e Bearer", async () => {
      fetchMock.mockResolvedValue(respostaOk({ id: "u1", active: true }));

      await atualizarUsuario("sup-token", "u1", { active: true });

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/users/u1`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: true }),
          headers: expect.objectContaining({ Authorization: "Bearer sup-token" }),
        }),
      );
    });
  });

  describe("tratamento de resposta", () => {
    it("retorna o json quando a resposta e ok", async () => {
      const corpo = { itens: [{ id: "1", status: "COMPLETED" }], proximoCursor: null };
      fetchMock.mockResolvedValue(respostaOk(corpo));

      await expect(buscarSessoes("token")).resolves.toEqual(corpo);
    });

    it("retorna undefined em 204 sem tentar parsear o corpo", async () => {
      const json = vi.fn();
      fetchMock.mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);

      // Nenhuma rota de sessao devolve 204 hoje, mas o helper precisa aguentar.
      await expect(buscarSessoes("token")).resolves.toBeUndefined();
      expect(json).not.toHaveBeenCalled();
    });
  });

  describe("tratamento de erro", () => {
    it("lanca ApiError com a mensagem do servidor", async () => {
      fetchMock.mockResolvedValue(
        respostaErro({ message: "E-mail ou senha invalidos" }, 401),
      );

      await expect(
        entrar({ email: "f@example.com", password: "errada" }),
      ).rejects.toThrowError(new ApiError("E-mail ou senha invalidos"));
    });

    it("junta com virgula quando o servidor devolve lista de mensagens", async () => {
      fetchMock.mockResolvedValue(
        respostaErro(
          {
            message: [
              "A senha deve ter no minimo 8 caracteres",
              "email must be an email",
            ],
          },
          400,
        ),
      );

      await expect(
        registrar({ name: "F", email: "invalido", password: "a1" }),
      ).rejects.toThrow(
        "A senha deve ter no minimo 8 caracteres, email must be an email",
      );
    });

    it("usa mensagem padrao quando o corpo do erro nao e json valido", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("nao e json");
        },
      } as unknown as Response);

      await expect(buscarSessoes("token")).rejects.toThrow(
        "Erro inesperado ao falar com o servidor",
      );
    });

    it("usa mensagem padrao quando o corpo do erro nao tem campo message", async () => {
      fetchMock.mockResolvedValue(respostaErro({ statusCode: 500 }, 500));

      await expect(buscarSessoes("token")).rejects.toThrow(
        "Erro inesperado ao falar com o servidor",
      );
    });

    it("o erro lancado e uma instancia de ApiError (usado para decidir a mensagem na UI)", async () => {
      fetchMock.mockResolvedValue(respostaErro({ message: "qualquer" }, 400));

      await expect(buscarSessoes("token")).rejects.toBeInstanceOf(ApiError);
    });

    it("propaga falha de rede (servidor fora do ar) sem virar ApiError", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const promessa = buscarSessoes("token");

      await expect(promessa).rejects.toThrow("Failed to fetch");
      await expect(promessa).rejects.not.toBeInstanceOf(ApiError);
    });
  });
});
