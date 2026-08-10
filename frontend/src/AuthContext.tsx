import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { entrar, registrar } from "./api";
import type { Usuario } from "./types";

const STORAGE_KEY = "gyn-monkey.auth";

interface SessaoArmazenada {
  token: string;
  user: Usuario;
}

interface AuthContextValue {
  token: string | null;
  user: Usuario | null;
  login: (email: string, password: string) => Promise<void>;
  cadastrar: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function carregarSessao(): SessaoArmazenada | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessaoArmazenada;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoArmazenada | null>(carregarSessao);

  const salvarSessao = useCallback((nova: SessaoArmazenada) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nova));
    setSessao(nova);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const resposta = await entrar({ email, password });
      salvarSessao({ token: resposta.accessToken, user: resposta.user });
    },
    [salvarSessao],
  );

  const cadastrar = useCallback(
    async (name: string, email: string, password: string) => {
      const resposta = await registrar({ name, email, password });
      salvarSessao({ token: resposta.accessToken, user: resposta.user });
    },
    [salvarSessao],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessao(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: sessao?.token ?? null,
      user: sessao?.user ?? null,
      login,
      cadastrar,
      logout,
    }),
    [sessao, login, cadastrar, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
