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
  /**
   * Se o lapis de correcao deve aparecer. Falso em treino em andamento e em
   * treino que ja gastou a sua correcao (sao uma por sessao). Tambem vem do
   * servidor: e a mesma regra que ele aplica no PATCH.
   */
  corrigivel: boolean;
}

export type StatusSemana = "CUMPRIDA" | "CONGELADA" | "PERDIDA";

/**
 * Meta semanal e sequencia de SEMANAS (v1.0). Passa a ser o numero principal
 * da home: a streak diaria pune o descanso, porque so sobrevive treinando
 * todo dia. Tudo aqui vem calculado do servidor, no fuso da pessoa.
 */
export interface MetaSemanal {
  semana: { inicio: string; fim: string };
  meta: number;
  treinos: number;
  faltam: number;
  cumprida: boolean;
  streakSemanas: number;
  /** Congelamentos guardados: cobrem uma semana fraca sem zerar a sequencia. */
  tokens: number;
  /** Meta nova ja escolhida, que passa a valer na semana informada. */
  metaAgendada: { meta: number; validaDe: string } | null;
  /** Presente quando da para recuperar a sequencia perdida fazendo `exige`. */
  reparo: { streakSalva: number; exige: number } | null;
  /** Quatro semanas ou mais sem treino: a tela troca o tom, sem cobranca. */
  recomeco: boolean;
  limites: { metaMin: number; metaMax: number };
}

export interface SemanaFechada {
  semanaInicio: string;
  semanaFim: string;
  meta: number;
  treinos: number;
  status: StatusSemana;
  reparo: boolean;
  congelamentoUsado: boolean;
  streakDepois: number;
}

export interface ResumoSessoes {
  emAndamento: Sessao | null;
  /** Streak diaria atual. Continua existindo, mas nao e mais o destaque. */
  streak: number;
  /** Melhor sequencia de dias ja feita: comemora o feito em vez de cobrar. */
  recordeDiario: number;
  semana: { treinos: number; minutos: number };
  meta: MetaSemanal;
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
