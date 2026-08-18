import type { Registro } from "./types";

export interface Sessao {
  inicio: Registro;
  fim: Registro;
}

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

export function duracaoEmMinutos(inicioIso: string, fimIso: string): number {
  return Math.max(0, Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000));
}

export function isoParaDatetimeLocal(iso: string): string {
  const data = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

export function ordenarPorHorarioDesc(registros: Registro[]): Registro[] {
  return [...registros].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * Espera o historico em ordem decrescente de horario (mais recente primeiro),
 * como vem da API: para cada CHECK_OUT, o registro seguinte na lista e o
 * CHECK_IN que o iniciou.
 */
export function calcularSessoesCompletas(historico: Registro[]): Sessao[] {
  const sessoes: Sessao[] = [];

  for (let i = 0; i < historico.length; i++) {
    const fim = historico[i];
    if (fim.type !== "CHECK_OUT") continue;

    const inicio = historico[i + 1];
    if (inicio?.type === "CHECK_IN") {
      sessoes.push({ inicio, fim });
    }
  }

  return sessoes;
}

export function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

export function calcularStreak(historico: Registro[]): number {
  const diasComRegistro = new Set(historico.map((registro) => chaveDoDia(new Date(registro.timestamp))));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!diasComRegistro.has(chaveDoDia(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (diasComRegistro.has(chaveDoDia(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function inicioDaSemana(): Date {
  const dia = new Date();
  dia.setHours(0, 0, 0, 0);
  const diaDaSemana = dia.getDay();
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  dia.setDate(dia.getDate() - diasDesdeSegunda);
  return dia;
}

export function calcularResumoSemanal(sessoes: Sessao[]): { treinos: number; minutos: number } {
  const inicio = inicioDaSemana();
  const sessoesDaSemana = sessoes.filter((sessao) => new Date(sessao.fim.timestamp) >= inicio);
  const minutos = sessoesDaSemana.reduce(
    (total, sessao) => total + duracaoEmMinutos(sessao.inicio.timestamp, sessao.fim.timestamp),
    0,
  );

  return { treinos: sessoesDaSemana.length, minutos };
}
