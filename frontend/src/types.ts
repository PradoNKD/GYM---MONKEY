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
