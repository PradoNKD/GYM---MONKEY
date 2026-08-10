export type TipoRegistro = "CHECK_IN" | "CHECK_OUT";

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
}

export interface AuthResponse {
  accessToken: string;
  user: Usuario;
}
