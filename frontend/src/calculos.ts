import type { Sessao } from "./types";

// O que sobrou aqui e formatacao e agrupamento para exibir.
//
// Streak, resumo da semana, pareamento e classificacao saíram de proposito na
// v0.9: agora vem calculados do servidor, no fuso do usuario. Enquanto essa
// conta vivia no cliente, ela usava o fuso do aparelho e podia ser burlada --
// era o que permitia inflar o contador da semana com treinos de 1 segundo.

export function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatarMinutos(totalMinutos: number): string {
  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;

  if (horas === 0) return `${minutosRestantes}min`;
  return `${horas}h ${minutosRestantes}min`;
}

export function isoParaDatetimeLocal(iso: string): string {
  const data = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

export function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Converte o dayKey do servidor (YYYY-MM-DD, ja no fuso do usuario) em Date
 * local. Ao meio-dia de proposito: em qualquer fuso, meio-dia continua sendo
 * o mesmo dia civil, enquanto meia-noite pode escorregar para o dia anterior.
 */
export function dataDaChave(dayKey: string): Date {
  const [ano, mes, dia] = dayKey.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

export interface GrupoDeSessoes {
  /** O dayKey do servidor. */
  chave: string;
  /** Data local do dia, para rotular o grupo. */
  data: Date;
  sessoes: Sessao[];
}

/**
 * Agrupa as sessoes por dia usando o `dayKey` que o servidor mandou -- e nao
 * recalculando o dia a partir do timestamp. Assim um treino as 22h aparece no
 * dia certo mesmo que o aparelho esteja em outro fuso.
 *
 * A lista vem do servidor da mais recente pra mais antiga; a ordem e mantida.
 */
export function agruparSessoesPorDia(sessoes: Sessao[]): GrupoDeSessoes[] {
  const grupos: GrupoDeSessoes[] = [];

  for (const sessao of sessoes) {
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.chave === sessao.dayKey) {
      ultimo.sessoes.push(sessao);
      continue;
    }

    grupos.push({
      chave: sessao.dayKey,
      data: dataDaChave(sessao.dayKey),
      sessoes: [sessao],
    });
  }

  return grupos;
}

/**
 * Rotulo do cabecalho de cada dia: "Hoje", "Ontem" ou a data em dd/mm/aaaa.
 * `referencia` existe para os testes poderem fixar o "hoje".
 */
export function rotuloDoDia(data: Date, referencia: Date = new Date()): string {
  const hoje = new Date(referencia);
  hoje.setHours(0, 0, 0, 0);

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const alvo = new Date(data);
  alvo.setHours(0, 0, 0, 0);

  if (chaveDoDia(alvo) === chaveDoDia(hoje)) return "Hoje";
  if (chaveDoDia(alvo) === chaveDoDia(ontem)) return "Ontem";

  return alvo.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * O que mostrar na coluna de duracao.
 *
 * AUTO_CLOSED nunca mostra o numero: o servidor grava o teto de 6h nessas
 * sessoes, e exibir "6h" para quem simplesmente esqueceu de finalizar seria
 * mentira. SHORT mostra a duracao real, mas a tela a marca como nao contavel.
 */
export function descricaoDaDuracao(sessao: Sessao): string {
  if (sessao.status === "OPEN") return "em andamento";
  if (sessao.status === "AUTO_CLOSED") return "nao finalizado";
  if (sessao.durationMin === null) return "-";

  return formatarMinutos(sessao.durationMin);
}

/**
 * Se o horario de fim pode ser exibido.
 *
 * Em AUTO_CLOSED o fim e sintetico (inicio + 6h, o teto), entao mostrar
 * "18:00 - 00:00" sugeriria que a pessoa treinou ate meia-noite. Nessas
 * sessoes so o inicio e um fato.
 */
export function temFimConfiavel(sessao: Sessao): boolean {
  return sessao.endedAt !== null && sessao.status !== "AUTO_CLOSED";
}

/** Texto curto explicando por que a sessao nao conta (null se conta). */
export function motivoDeNaoContar(sessao: Sessao, duracaoMinimaMin: number): string | null {
  if (sessao.contavel || sessao.status === "OPEN") return null;

  if (sessao.status === "AUTO_CLOSED") {
    return "Encerrado automaticamente: faltou finalizar";
  }

  return `Abaixo de ${duracaoMinimaMin} min: nao conta na semana`;
}
