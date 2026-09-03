import { ApiError } from "./api";
import { ehRetentavel } from "./rede";
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

/**
 * O que dizer depois de uma correcao aceita.
 *
 * Nao basta "salvo". Corrigir para 5 minutos e aceito pelo servidor e a sessao
 * continua nao contando na semana -- se a tela so dissesse "sucesso", a pessoa
 * olharia o numero da semana parado e concluiria que o app esta errado. A
 * confirmacao diz o resultado, nao so que a escrita funcionou.
 */
export function mensagemDeSucesso(sessao: Sessao, duracaoMinimaMin: number): string {
  const duracao = descricaoDaDuracao(sessao);

  if (sessao.contavel) {
    return `Treino corrigido: ${duracao}, contando na semana.`;
  }

  return `Treino corrigido: ${duracao}. Abaixo de ${duracaoMinimaMin}min, entao nao conta na semana.`;
}

/**
 * O toque em "Começar/Finalizar treino" chegou a valer no servidor?
 *
 * Serve para um caso especifico e chato: a requisicao falhou, mas **nao se sabe
 * onde**. Pode nao ter saido do celular -- e ai nada aconteceu -- ou pode ter
 * sido processada e a RESPOSTA ter se perdido no caminho, e ai o treino comecou
 * (ou terminou) sem o app saber.
 *
 * Por isso escrita nao se repete cegamente: repetir no segundo caso inverteria
 * o estado, finalizando o treino que a propria chamada acabou de abrir, e a
 * pessoa ficaria com uma sessao de 0 minuto achando que nada aconteceu. O que
 * se faz e **perguntar ao servidor** como as coisas ficaram e comparar com o
 * que se tinha antes.
 *
 * A comparacao e o estado "ha treino aberto?" antes e depois: se virou, o toque
 * valeu. E o unico sinal necessario, porque o toggle so faz isso -- abre ou
 * fecha.
 */
export function toggleFoiAplicado(
  haTreinoAbertoAntes: boolean,
  haTreinoAbertoDepois: boolean,
): boolean {
  return haTreinoAbertoAntes !== haTreinoAbertoDepois;
}

/**
 * O texto que a tela mostra quando a LEITURA nao deu certo.
 *
 * Existe porque a mensagem que aparecia era o rotulo de ultimo recurso da
 * `api.ts` -- "Erro inesperado ao falar com o servidor" -- e ela errava em tres
 * frentes de uma vez. Chamava de inesperado justamente o caso que a gente
 * acabou de passar 27 segundos anunciando (o servidor acordando); nao dizia o
 * que fazer; e o 502 do proxy nem carrega mensagem propria, entao caia ali por
 * acidente, nao por decisao.
 *
 * A ordem das perguntas importa. Sem conexao vem primeiro porque, se o aparelho
 * esta offline, qualquer coisa dita sobre o servidor e chute. Depois vem a falha
 * de transporte ou de proxy, que e o cold start estourando o tempo. So no fim se
 * mostra o texto do erro -- e **apenas** se ele veio de um `ApiError`, ou seja,
 * se foi o servidor quem escreveu. A mensagem de um `Error` comum e recado de
 * programador ("Failed to fetch", "undefined is not a function"): mostrar isso
 * nao informa nada a quem esta na academia e ainda parece que o app vazou por
 * dentro.
 */
export function mensagemDeFalhaNaLeitura(erro: unknown, online: boolean): string {
  if (!online) {
    return "Sem conexao com a internet. Reconecte e toque em tentar de novo.";
  }

  if (ehRetentavel(erro)) {
    return "O servidor nao respondeu a tempo. Ele pode estar acordando ainda -- toque em tentar de novo.";
  }

  if (erro instanceof ApiError && erro.message.trim() !== "") {
    return erro.message;
  }

  return "Nao foi possivel carregar seus treinos.";
}
