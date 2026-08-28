// Datas no fuso do usuario, sem biblioteca externa.
//
// Os instantes ficam em UTC no banco; dia e semana precisam ser resolvidos no
// fuso da pessoa, senao quem treina 22h de Sao Paulo teria o treino contado no
// dia seguinte (UTC). O Intl ja sabe fuso e horario de verao, entao usamos ele
// em vez de somar offsets na mao.

// 'en-CA' formata como YYYY-MM-DD, que e exatamente o formato do dayKey.
export function chaveDoDia(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 0 = domingo ... 6 = sabado, no fuso informado.
export function diaDaSemana(instante: Date, fuso: string): number {
  const nome = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    weekday: 'short',
  }).format(instante);

  return DIAS.indexOf(nome);
}

// Aritmetica de data "pura" (sem hora e sem fuso): a chave ja e um dia civil,
// entao somar dias em UTC nao corre risco de horario de verao.
export function somarDias(chave: string, dias: number): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return data.toISOString().slice(0, 10);
}

// Segunda-feira da semana ISO a que um dia pertence.
//
// Recebe a chave do dia (ja resolvida no fuso da pessoa), nao um instante: a
// partir daqui e aritmetica de calendario civil, sem fuso envolvido. E o que
// permite fechar semanas passadas a partir dos dayKey guardados, sem ter de
// reconstruir o instante de cada uma.
export function inicioDaSemana(chave: string): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  // Domingo (0) e o ultimo dia da semana ISO, nao o primeiro.
  const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  const desdeSegunda = dow === 0 ? 6 : dow - 1;

  return somarDias(chave, -desdeSegunda);
}

// Semana ISO: segunda a domingo, no fuso do usuario.
export function semanaDe(instante: Date, fuso: string): { inicio: string; fim: string } {
  const inicio = inicioDaSemana(chaveDoDia(instante, fuso));

  return { inicio, fim: somarDias(inicio, 6) };
}

/** Quantas semanas inteiras separam duas segundas-feiras (b - a). */
export function semanasEntre(a: string, b: string): number {
  const dias = (chave: string) => {
    const [ano, mes, dia] = chave.split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia) / 86400000;
  };

  return Math.round((dias(b) - dias(a)) / 7);
}

export function minutosEntre(inicio: Date, fim: Date): number {
  return Math.floor((fim.getTime() - inicio.getTime()) / 60000);
}
