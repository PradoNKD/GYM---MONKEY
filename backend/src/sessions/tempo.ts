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

// Semana ISO: segunda a domingo, no fuso do usuario.
export function semanaDe(instante: Date, fuso: string): { inicio: string; fim: string } {
  const hoje = chaveDoDia(instante, fuso);
  const dow = diaDaSemana(instante, fuso);
  // Domingo (0) e o ultimo dia da semana ISO, nao o primeiro.
  const desdeSegunda = dow === 0 ? 6 : dow - 1;
  const inicio = somarDias(hoje, -desdeSegunda);

  return { inicio, fim: somarDias(inicio, 6) };
}

export function minutosEntre(inicio: Date, fim: Date): number {
  return Math.floor((fim.getTime() - inicio.getTime()) / 60000);
}
