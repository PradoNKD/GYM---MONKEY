import { PrismaClient, Role, SessionStatus, WorkoutType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Popula um banco LOCAL com cenarios prontos para validar a tela a mao.
 *
 * Existe porque os cenarios que mais importam sao os dificeis de produzir
 * clicando: streak de varias semanas, congelamento gasto, reparo disponivel,
 * modo recomeco. Nenhum deles se alcanca em um dia de uso -- e testar so o
 * caminho feliz e como nao testar.
 *
 * Uso:
 *   npm run semear-teste            # cria (ou recria) as contas de teste
 *   npm run semear-teste -- --limpar  # apaga so as contas de teste
 *
 * Senha de todas as contas: teste1234
 */

const SENHA = 'teste1234';
const SUFIXO = '@teste.local';
const SALT_ROUNDS = 10;

/**
 * Trava de seguranca: este script INVENTA usuarios e treinos. Rodar contra o
 * Neon encheria a producao de dados falsos que a API nao sabe apagar (nao ha
 * rota de exclusao de usuario). Por isso a checagem e por lista de permissao,
 * nao por lista de bloqueio: qualquer host que nao seja reconhecidamente local
 * e recusado, mesmo que seja inofensivo.
 */
function exigirBancoLocal(url: string | undefined): void {
  if (!url) {
    console.error('DATABASE_URL nao definida.');
    process.exit(1);
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error('DATABASE_URL nao parece uma URL valida.');
    process.exit(1);
  }

  const LOCAIS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
  if (!LOCAIS.includes(host)) {
    console.error(
      `\nRECUSADO: este script so roda contra banco local, e o host e "${host}".\n\n` +
        'Ele cria usuarios e treinos falsos. Em producao isso seria irreversivel:\n' +
        'a API nao tem rota de exclusao de usuario, entao as contas ficariam\n' +
        'para sempre na lista e apareceriam no painel do supervisor e no placar.\n',
    );
    process.exit(1);
  }
}

const prisma = new PrismaClient();

/** Segunda-feira da semana de um dia, em aritmetica de calendario civil. */
function segundaDe(chave: string): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const dow = data.getUTCDay();
  data.setUTCDate(data.getUTCDate() - (dow === 0 ? 6 : dow - 1));

  return data.toISOString().slice(0, 10);
}

function somarDias(chave: string, dias: number): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return data.toISOString().slice(0, 10);
}

const HOJE = new Date().toISOString().slice(0, 10);
const SEGUNDA_DESTA_SEMANA = segundaDe(HOJE);

/** Segunda da semana `n` semanas atras (0 = esta). */
function semanaAtras(n: number): string {
  return somarDias(SEGUNDA_DESTA_SEMANA, -7 * n);
}

type Treino = {
  dia: string;
  minutos?: number;
  tipos?: WorkoutType[];
  esforco?: number;
  nota?: string;
  status?: SessionStatus;
};

async function criarUsuario(opcoes: {
  nome: string;
  email: string;
  role?: Role;
  meta?: number;
  treinos: Treino[];
}) {
  const email = opcoes.email.toLowerCase();
  const user = await prisma.user.create({
    data: {
      name: opcoes.nome,
      email,
      passwordHash: await bcrypt.hash(SENHA, SALT_ROUNDS),
      active: true,
      role: opcoes.role ?? Role.USER,
      timezone: 'America/Sao_Paulo',
    },
  });

  const grupo = await prisma.group.findFirst({ where: { slug: 'gym-monkey' } });
  if (grupo) {
    await prisma.membership.create({ data: { userId: user.id, groupId: grupo.id } });
  }

  if (opcoes.meta) {
    await prisma.weeklyGoal.create({ data: { userId: user.id, meta: opcoes.meta } });
  }

  for (const treino of opcoes.treinos) {
    const minutos = treino.minutos ?? 55;
    // 18h em Sao Paulo (UTC-3) = 21h UTC. Horario de academia de verdade, e
    // longe da meia-noite, pra o dayKey nao virar refem do fuso do runner.
    const inicio = new Date(`${treino.dia}T21:00:00Z`);

    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        groupId: grupo?.id ?? null,
        startedAt: inicio,
        endedAt: new Date(inicio.getTime() + minutos * 60000),
        durationMin: minutos,
        status: treino.status ?? SessionStatus.COMPLETED,
        dayKey: treino.dia,
        workoutTypes: treino.tipos ?? [],
        effort: treino.esforco ?? null,
        note: treino.nota ?? null,
      },
    });
  }

  return user;
}

/** Treinos em N dias distintos de uma semana, a partir da segunda. */
function naSemana(segunda: string, quantos: number, extras: Partial<Treino> = {}): Treino[] {
  // Segunda, quarta, sexta, terca, quinta, sabado: espalha como quem treina de
  // verdade, em vez de dias seguidos.
  const ordem = [0, 2, 4, 1, 3, 5];

  return ordem.slice(0, quantos).map((offset) => ({
    dia: somarDias(segunda, offset),
    ...extras,
  }));
}

async function limpar() {
  const alvos = await prisma.user.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true, email: true },
  });

  if (alvos.length === 0) {
    console.log('Nada para limpar.');
    return;
  }

  await prisma.user.deleteMany({ where: { id: { in: alvos.map((u) => u.id) } } });
  console.log(`Apagadas ${alvos.length} contas de teste.`);
}

async function semear() {
  await limpar();

  // O grupo ja existe desde a migration da v0.9; se o banco for novo, cria.
  await prisma.group.upsert({
    where: { slug: 'gym-monkey' },
    update: {},
    create: { name: 'GYM MONKEY', slug: 'gym-monkey' },
  });

  const contas: { rotulo: string; email: string; esperado: string }[] = [];

  // 1. Caminho comum: sequencia viva, semana em andamento, registros preenchidos.
  await criarUsuario({
    nome: 'Ana Regular',
    email: `ana${SUFIXO}`,
    treinos: [
      ...naSemana(semanaAtras(3), 3, { tipos: [WorkoutType.PERNAS], esforco: 4 }),
      ...naSemana(semanaAtras(2), 4, { tipos: [WorkoutType.COSTAS], esforco: 3 }),
      ...naSemana(semanaAtras(1), 3, {
        tipos: [WorkoutType.PEITO, WorkoutType.BRACOS],
        esforco: 5,
        nota: 'supino 4x10 com 40kg, rosca direta 3x12',
      }),
      // Esta semana: 2 de 3, uma sem registro nenhum (pra testar o estado vazio).
      { dia: somarDias(SEGUNDA_DESTA_SEMANA, 0), tipos: [WorkoutType.CARDIO], esforco: 2 },
      { dia: somarDias(SEGUNDA_DESTA_SEMANA, 1) },
    ],
  });
  contas.push({
    rotulo: 'Ana Regular',
    email: `ana${SUFIXO}`,
    esperado: '3 semanas seguidas, 2/3 nesta semana, registros preenchidos',
  });

  // 2. Congelamento gasto: sumiu uma semana com a sequencia viva.
  await criarUsuario({
    nome: 'Bruno Congelado',
    email: `bruno${SUFIXO}`,
    treinos: [
      ...naSemana(semanaAtras(3), 3),
      ...naSemana(semanaAtras(2), 3),
      // semanaAtras(1) vazia -> gasta 1 congelamento, streak nao zera
    ],
  });
  contas.push({
    rotulo: 'Bruno Congelado',
    email: `bruno${SUFIXO}`,
    esperado: 'semana passada CONGELADA: 2 semanas seguidas e 1 congelamento restante',
  });

  // 3. Reparo disponivel: perdeu a semana passada depois de gastar os dois tokens.
  await criarUsuario({
    nome: 'Carla Reparo',
    email: `carla${SUFIXO}`,
    treinos: [
      ...naSemana(semanaAtras(5), 3),
      ...naSemana(semanaAtras(4), 3),
      // 3, 2 e 1 semanas atras vazias: congela, congela, PERDE
    ],
  });
  contas.push({
    rotulo: 'Carla Reparo',
    email: `carla${SUFIXO}`,
    esperado: 'semana passada PERDIDA: aviso de reparo oferecendo 4 treinos p/ recuperar 2 semanas',
  });

  // 4. Modo recomeco: quatro semanas sem nada.
  await criarUsuario({
    nome: 'Diego Sumido',
    email: `diego${SUFIXO}`,
    treinos: [...naSemana(semanaAtras(6), 3)],
  });
  contas.push({
    rotulo: 'Diego Sumido',
    email: `diego${SUFIXO}`,
    esperado: 'modo recomeco, sem nenhuma cobranca na tela',
  });

  // 5. Conta nova, tudo zerado.
  await criarUsuario({ nome: 'Elis Novata', email: `elis${SUFIXO}`, treinos: [] });
  contas.push({
    rotulo: 'Elis Novata',
    email: `elis${SUFIXO}`,
    esperado: 'zero tudo, 2 congelamentos, meta 3 e nenhuma semana fechada',
  });

  // 6. Meta alta e sessoes que NAO contam, pra ver os avisos do historico.
  await criarUsuario({
    nome: 'Felipe Meta6',
    email: `felipe${SUFIXO}`,
    meta: 6,
    treinos: [
      ...naSemana(SEGUNDA_DESTA_SEMANA, 2, { tipos: [WorkoutType.OMBROS], esforco: 3 }),
      {
        dia: somarDias(SEGUNDA_DESTA_SEMANA, 2),
        minutos: 4,
        status: SessionStatus.SHORT,
        nota: 'cheguei e a academia estava lotada',
      },
      {
        dia: somarDias(SEGUNDA_DESTA_SEMANA, 3),
        minutos: 360,
        status: SessionStatus.AUTO_CLOSED,
      },
    ],
  });
  contas.push({
    rotulo: 'Felipe Meta6',
    email: `felipe${SUFIXO}`,
    esperado: 'meta 6, sessao SHORT e AUTO_CLOSED no historico com aviso de "nao conta"',
  });

  // 7. Supervisor, pra abrir o painel.
  await criarUsuario({
    nome: 'Gabi Supervisora',
    email: `gabi${SUFIXO}`,
    role: Role.SUPERVISOR,
    treinos: [...naSemana(SEGUNDA_DESTA_SEMANA, 1)],
  });
  contas.push({
    rotulo: 'Gabi Supervisora',
    email: `gabi${SUFIXO}`,
    esperado: 'acesso ao painel; corrige treino de qualquer um e mexe no inicio',
  });

  console.log('\nContas de teste criadas. Senha de todas: ' + SENHA + '\n');
  for (const c of contas) {
    console.log(`  ${c.email}`);
    console.log(`     ${c.esperado}\n`);
  }
  console.log(
    'As semanas fechadas sao calculadas na primeira leitura de /sessions:\n' +
      'basta entrar com a conta que os numeros aparecem.\n',
  );
}

async function main() {
  exigirBancoLocal(process.env.DATABASE_URL);

  try {
    if (process.argv.includes('--limpar')) {
      await limpar();
    } else {
      await semear();
    }
  } catch (error) {
    console.error('Falhou:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
