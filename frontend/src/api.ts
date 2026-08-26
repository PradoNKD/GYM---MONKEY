import type {
  AuthResponse,
  Correcao,
  PaginaSessoes,
  RegisterResponse,
  Role,
  Sessao,
  UsuarioAdmin,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

class ApiError extends Error {}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.message ?? "Erro inesperado ao falar com o servidor";
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function registrar(data: {
  name: string;
  email: string;
  password: string;
}) {
  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function entrar(data: { email: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Sessoes de treino ---
// Substituem /time-entries: o servidor pareia, classifica e agrega. As rotas
// antigas continuam no ar como auditoria, mas a tela nao as usa mais.

export function buscarSessoes(
  token: string,
  opcoes: { cursor?: string; limite?: number } = {},
) {
  const params = new URLSearchParams();
  if (opcoes.cursor) params.set("cursor", opcoes.cursor);
  if (opcoes.limite) params.set("limite", String(opcoes.limite));
  const query = params.toString();

  return request<PaginaSessoes>(`/sessions${query ? `?${query}` : ""}`, { token });
}

/** Comeca ou finaliza o treino. Nao manda horario: quem marca e o servidor. */
export function alternarTreino(token: string) {
  return request<Sessao>("/sessions/toggle", {
    method: "POST",
    token,
  });
}

/**
 * Corrige os horarios de uma sessao. O motivo e obrigatorio porque toda
 * correcao fica registrada na auditoria com autor e antes/depois.
 */
export function corrigirSessao(
  token: string,
  id: string,
  dados: { startedAt?: string; endedAt?: string; reason: string },
) {
  return request<Sessao>(`/sessions/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(dados),
  });
}

export function buscarCorrecoes(token: string, id: string) {
  return request<Correcao[]>(`/sessions/${id}/corrections`, { token });
}

// --- Painel de supervisor ---

export function listarUsuarios(token: string) {
  return request<UsuarioAdmin[]>("/users", { token });
}

export function atualizarUsuario(
  token: string,
  id: string,
  data: { active?: boolean; role?: Role },
) {
  return request<UsuarioAdmin>(`/users/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export { ApiError };
