export type TipoRegistro = "CHECK_IN" | "CHECK_OUT";

export type Role = "USER" | "SUPERVISOR";

export interface Registro {
  id: string;
  type: TipoRegistro;
  timestamp: string;
  userId: string;
}

export interface Usuario {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: Usuario;
}

// Resposta do cadastro: a conta entra pendente de aprovacao, sem token.
export interface RegisterResponse {
  status: "pending_approval";
  message: string;
}

// Usuario como o painel de supervisor enxerga (inclui active).
export interface UsuarioAdmin {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

// --- Sessoes de treino (v0.9) ---
// O servidor e a fonte da verdade: ele classifica a sessao e ja entrega streak
// e resumo da semana calculados, no fuso do usuario.

export type StatusSessao = "OPEN" | "COMPLETED" | "SHORT" | "AUTO_CLOSED";

export interface Sessao {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  status: StatusSessao;
  source: string;
  /** Dia (YYYY-MM-DD) ja resolvido no fuso do usuario pelo servidor. */
  dayKey: string;
  /** Se entra nas contagens. Vem pronto pra tela nao reimplementar a regra. */
  contavel: boolean;
}

export interface ResumoSessoes {
  emAndamento: Sessao | null;
  streak: number;
  semana: { treinos: number; minutos: number };
  regras: { duracaoMinimaMin: number };
}

export interface PaginaSessoes {
  itens: Sessao[];
  proximoCursor: string | null;
  resumo: ResumoSessoes;
}

export interface Correcao {
  id: string;
  reason: string;
  createdAt: string;
  authorId: string | null;
}
