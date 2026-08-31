import { AchievementKind } from '@prisma/client';
import { SEMANAS_DE_AUSENCIA } from './semanas';
import { inicioDaSemana, semanasEntre, somarDias } from './tempo';

// Conquistas: marcos e recordes (v1.0).
//
// O catalogo vive no CODIGO, nao no banco: sao regras, e regra em tabela vira
// regra que ninguem revisa. Aqui tambem nao ha Prisma nem HTTP -- so a decisao
// "com estes numeros, o que a pessoa conquistou?", que fica testavel sozinha.
//
// Restricoes permanentes do produto que valem em cada linha deste arquivo:
//
// 1. Nada compara com outra pessoa. Conquista e sobre a propria historia.
// 2. Nada pune. Nao existe marco de "voce faltou" nem contagem regressiva.
// 3. Zero dado clinico ou corporal (LGPD art. 11): nada de peso, medida ou
//    carga. So frequencia e constancia.
// 4. Voltar vale tanto quanto nunca ter parado -- dai REPAROU e RECOMECOU.
//    Um catalogo que so premia a sequencia perfeita diz a quem falhou que nao
//    ha mais nada a ganhar, que e exatamente quando a pessoa desiste.

/** O retrato do qual toda conquista e deduzida. */
export type EstatisticasDoUsuario = {
  /** Dias distintos com treino contavel, na vida. */
  totalDias: number;
  /** Minutos somados dos treinos contaveis. */
  totalMinutos: number;
  /** Semanas fechadas com status CUMPRIDA. */
  semanasCumpridas: number;
  /** Melhor sequencia de semanas ja alcancada. */
  melhorStreakSemanas: number;
  /** Melhor sequencia de dias seguidos ja alcancada. */
  melhorStreakDias: number;
  /** Maior numero de dias treinados numa mesma semana. */
  melhorSemana: number;
  /** A pessoa ja usou o reparo com sucesso. */
  reparou: boolean;
  /** A pessoa ja voltou depois de quatro ou mais semanas sem treinar. */
  recomecou: boolean;
};

/**
 * Deriva dos DIAS treinados tudo o que nao depende de meta nem de congelamento.
 *
 * Recebe a lista ja ordenada de dias com treino contavel (com os minutos do
 * dia). Uma consulta so no banco alimenta esta funcao inteira.
 */
export function estatisticasDosDias(
  dias: { dia: string; minutos: number }[],
): Pick<
  EstatisticasDoUsuario,
  'totalDias' | 'totalMinutos' | 'melhorStreakDias' | 'melhorSemana' | 'recomecou'
> {
  const chaves = new Set(dias.map((d) => d.dia));

  // Maior sequencia de dias seguidos: cada dia sem o anterior comeca uma
  // corrida, e a partir dele se anda para frente. Cada dia e visitado uma vez.
  let melhorStreakDias = 0;
  for (const dia of chaves) {
    if (chaves.has(somarDias(dia, -1))) continue;

    let corrida = 0;
    let passo = dia;
    while (chaves.has(passo)) {
      corrida++;
      passo = somarDias(passo, 1);
    }
    melhorStreakDias = Math.max(melhorStreakDias, corrida);
  }

  // Dias por semana, para a "semana mais cheia". Conta a semana corrente
  // tambem: recorde nao espera a semana fechar.
  const porSemana = new Map<string, number>();
  for (const dia of chaves) {
    const semana = inicioDaSemana(dia);
    porSemana.set(semana, (porSemana.get(semana) ?? 0) + 1);
  }
  const melhorSemana = Math.max(0, ...porSemana.values());

  // Recomeco: duas semanas com treino separadas por SEMANAS_DE_AUSENCIA ou mais
  // semanas vazias. Ou seja, a pessoa sumiu e VOLTOU -- o "voltou" e o que
  // importa, entao um sumico que ainda dura nao conta.
  const semanasComTreino = [...porSemana.keys()].sort();
  let recomecou = false;
  for (let i = 1; i < semanasComTreino.length; i++) {
    if (semanasEntre(semanasComTreino[i - 1], semanasComTreino[i]) > SEMANAS_DE_AUSENCIA) {
      recomecou = true;
      break;
    }
  }

  return {
    totalDias: chaves.size,
    totalMinutos: dias.reduce((t, d) => t + d.minutos, 0),
    melhorStreakDias,
    melhorSemana,
    recomecou,
  };
}

export type DefinicaoDeMarco = {
  code: string;
  nome: string;
  descricao: string;
  /** Para a barra de progresso do proximo marco. */
  alvo: number;
  progresso: (e: EstatisticasDoUsuario) => number;
};

export type DefinicaoDeRecorde = {
  code: string;
  nome: string;
  unidade: string;
  valor: (e: EstatisticasDoUsuario) => number;
};

/**
 * Marcos, em ordem de dificuldade. A escada e proposital: sempre tem um proximo
 * degrau visivel, e nenhum degrau exige nunca ter falhado.
 */
export const MARCOS: DefinicaoDeMarco[] = [
  {
    code: 'PRIMEIRO_TREINO',
    nome: 'Primeiro treino',
    descricao: 'O começo, que é a parte mais difícil.',
    alvo: 1,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'PRIMEIRA_SEMANA',
    nome: 'Primeira semana cheia',
    descricao: 'Uma semana inteira dentro da meta.',
    alvo: 1,
    progresso: (e) => e.semanasCumpridas,
  },
  {
    code: 'PRIMEIRO_MES',
    nome: 'Primeiro mês',
    descricao: 'Quatro semanas dentro da meta — não precisam ser seguidas.',
    alvo: 4,
    progresso: (e) => e.semanasCumpridas,
  },
  {
    code: 'DIAS_10',
    nome: '10 dias de treino',
    descricao: 'Dez dias diferentes na academia.',
    alvo: 10,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'DIAS_25',
    nome: '25 dias de treino',
    descricao: 'Já virou parte da rotina.',
    alvo: 25,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'DIAS_50',
    nome: '50 dias de treino',
    descricao: 'Cinquenta vezes que você foi, mesmo nos dias em que não queria.',
    alvo: 50,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'DIAS_100',
    nome: '100 dias de treino',
    descricao: 'Três dígitos.',
    alvo: 100,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'DIAS_200',
    nome: '200 dias de treino',
    descricao: 'Isso é mais de meio ano de dias treinados.',
    alvo: 200,
    progresso: (e) => e.totalDias,
  },
  {
    code: 'SEMANAS_4',
    nome: '4 semanas seguidas',
    descricao: 'Um mês inteiro sem quebrar a sequência.',
    alvo: 4,
    progresso: (e) => e.melhorStreakSemanas,
  },
  {
    // O limiar medido de formacao de habito: 4+ sessoes por semana durante 6
    // semanas (Kaushal & Rhodes, J Behav Med 2015).
    code: 'SEMANAS_6',
    nome: 'Hábito formado',
    descricao: 'Seis semanas seguidas — o limiar em que treinar deixa de exigir decisão.',
    alvo: 6,
    progresso: (e) => e.melhorStreakSemanas,
  },
  {
    code: 'SEMANAS_12',
    nome: 'Um trimestre',
    descricao: 'Doze semanas seguidas dentro da meta.',
    alvo: 12,
    progresso: (e) => e.melhorStreakSemanas,
  },
  {
    code: 'SEMANAS_26',
    nome: 'Meio ano',
    descricao: 'Vinte e seis semanas seguidas.',
    alvo: 26,
    progresso: (e) => e.melhorStreakSemanas,
  },
  {
    code: 'SEMANAS_52',
    nome: 'Um ano inteiro',
    descricao: 'Cinquenta e duas semanas seguidas dentro da meta.',
    alvo: 52,
    progresso: (e) => e.melhorStreakSemanas,
  },
  {
    code: 'HORAS_24',
    nome: 'Um dia inteiro treinando',
    descricao: '24 horas somadas desde o começo.',
    alvo: 24 * 60,
    progresso: (e) => e.totalMinutos,
  },
  {
    // Voltar e o comportamento mais dificil e o que o produto mais quer.
    code: 'REPAROU',
    nome: 'De volta ao trilho',
    descricao: 'Perdeu uma semana e recuperou a sequência na seguinte.',
    alvo: 1,
    progresso: (e) => (e.reparou ? 1 : 0),
  },
  {
    code: 'RECOMECOU',
    nome: 'Recomeço',
    descricao: 'Voltou a treinar depois de um mês fora. Ninguém vê isso, só você.',
    alvo: 1,
    progresso: (e) => (e.recomecou ? 1 : 0),
  },
];

/** Recordes: valem sempre, e comemoram quando a marca antiga cai. */
export const RECORDES: DefinicaoDeRecorde[] = [
  {
    code: 'RECORDE_SEMANAS',
    nome: 'Mais semanas seguidas',
    unidade: 'semanas',
    valor: (e) => e.melhorStreakSemanas,
  },
  {
    code: 'RECORDE_DIAS',
    nome: 'Mais dias seguidos',
    unidade: 'dias',
    valor: (e) => e.melhorStreakDias,
  },
  {
    code: 'RECORDE_SEMANA_CHEIA',
    nome: 'Semana mais cheia',
    unidade: 'treinos',
    valor: (e) => e.melhorSemana,
  },
];

/**
 * Recorde so vira festa a partir daqui. Comemorar "1 dia seguido" no primeiro
 * treino seria barulho em cima de um marco que ja existe (PRIMEIRO_TREINO).
 */
export const RECORDE_MINIMO_PARA_FESTA = 2;

export type ConquistaAvaliada = {
  code: string;
  kind: AchievementKind;
  /** Presente so em recorde. */
  value: number | null;
};

/** Marcos atingidos com estas estatisticas. */
export function marcosAlcancados(e: EstatisticasDoUsuario): ConquistaAvaliada[] {
  return MARCOS.filter((m) => m.progresso(e) >= m.alvo).map((m) => ({
    code: m.code,
    kind: AchievementKind.MARCO,
    value: null,
  }));
}

/** Valor atual de cada recorde, ignorando os que ainda estao em zero. */
export function recordesAtuais(e: EstatisticasDoUsuario): ConquistaAvaliada[] {
  return RECORDES.map((r) => ({
    code: r.code,
    kind: AchievementKind.RECORDE,
    value: r.valor(e),
  })).filter((r) => (r.value ?? 0) > 0);
}

/**
 * O proximo marco a perseguir, com o quanto falta. Devolve nulo quando a pessoa
 * ja pegou todos -- e nao um marco impossivel so para ter o que mostrar.
 */
export function proximoMarco(
  e: EstatisticasDoUsuario,
  conquistados: Set<string>,
): { code: string; nome: string; progresso: number; alvo: number } | null {
  const pendente = MARCOS.find((m) => !conquistados.has(m.code));
  if (!pendente) return null;

  return {
    code: pendente.code,
    nome: pendente.nome,
    // Nunca mostra progresso acima do alvo: barra passando de 100% confunde.
    progresso: Math.min(pendente.progresso(e), pendente.alvo),
    alvo: pendente.alvo,
  };
}

/**
 * Fresh start: datas em que recomecar custa menos.
 *
 * Base: o "fresh start effect" (Dai, Milkman & Riis, Management Science 2014) --
 * marcos temporais (1o do mes, 1o do ano) aumentam a chance de alguem comecar um
 * habito, porque separam a pessoa de quem ela era antes. A segunda-feira ja
 * ganha isso de graca, porque a semana reinicia.
 *
 * Recebe a chave do dia (YYYY-MM-DD) ja no fuso da pessoa.
 */
export function freshStart(hoje: string): 'ANO' | 'MES' | null {
  const [, mes, dia] = hoje.split('-');

  if (dia !== '01') return null;
  return mes === '01' ? 'ANO' : 'MES';
}
