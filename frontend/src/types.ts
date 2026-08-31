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

/**
 * O que a pessoa treinou (registro Fase A). Lista curta de proposito: e um
 * rotulo para ela se reconhecer no historico, nao um catalogo de exercicios.
 * Espelha o enum do servidor, como `StatusSessao` ja faz.
 */
export type TipoTreino =
  | "PEITO"
  | "COSTAS"
  | "PERNAS"
  | "OMBROS"
  | "BRACOS"
  | "ABDOMEN"
  | "CARDIO"
  | "CORPO_INTEIRO"
  | "OUTRO";

/**
 * O que a tela manda ao anotar um treino. Campo ausente NAO mexe no que ja
 * estava; `null` limpa. E o que impede salvar so o esforco e apagar a nota.
 */
export interface RegistroTreinoEntrada {
  workoutTypes?: TipoTreino[] | null;
  effort?: number | null;
  note?: string | null;
}

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

  // --- Registro Fase A ---
  // Sempre presentes (lista vazia / nulos), nunca ausentes: a tela nao trata
  // "campo que as vezes vem".
  workoutTypes: TipoTreino[];
  /** Esforco percebido de 1 a 5. */
  effort: number | null;
  note: string | null;
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
  regras: {
    duracaoMinimaMin: number;
    /** Limites do registro, para a tela nao repetir os numeros do servidor. */
    registro: {
      tiposMax: number;
      esforcoMin: number;
      esforcoMax: number;
      notaMax: number;
    };
  };
}

export interface PaginaSessoes {
  itens: Sessao[];
  proximoCursor: string | null;
  resumo: ResumoSessoes;
}

/** Um dia com treino contavel, para a grade do ano. */
export interface DiaDoMapa {
  dia: string;
  treinos: number;
  minutos: number;
}

/**
 * Mapa dos dias treinados. Vem so com os dias QUE TIVERAM treino: ausencia e
 * fundo neutro na tela, nao dado.
 */
export interface MapaDoAno {
  /** Segunda-feira da primeira semana exibida. */
  inicio: string;
  /** Hoje, no fuso da pessoa. Dia que nao aconteceu nao e dia sem treino. */
  fim: string;
  dias: DiaDoMapa[];
  total: { dias: number; treinos: number; minutos: number };
}

export interface Correcao {
  id: string;
  reason: string;
  createdAt: string;
  authorId: string | null;
}
