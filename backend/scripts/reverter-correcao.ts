// Desfaz correcoes de sessao, devolvendo o horario que o app havia gravado.
//
// Uso:
//   npm run reverter-correcao -- --listar                 lista o que foi corrigido
//   npm run reverter-correcao -- <sessionId>              SIMULA a reversao
//   npm run reverter-correcao -- <sessionId> --confirmar  aplica de verdade
//
// Em producao: DATABASE_URL apontando pro Neon.
//
// Simula por padrao. Escrita em producao exige --confirmar, como o backfill.
// A logica vive em src/sessions/reverter-correcao.ts (testada); aqui e so a casca.
import { PrismaClient } from '@prisma/client';
import {
  listarSessoesCorrigidas,
  reverterCorrecao,
} from '../src/sessions/reverter-correcao';

function hora(d: Date | null): string {
  return d ? d.toISOString().replace('T', ' ').slice(0, 16) : '-';
}

async function listar(prisma: PrismaClient) {
  const sessoes = await listarSessoesCorrigidas(prisma);

  if (sessoes.length === 0) {
    console.log('Nenhuma sessao corrigida.');
    return;
  }

  console.log(`${sessoes.length} sessao(oes) com correcao:\n`);
  for (const s of sessoes) {
    const duracaoOriginal =
      s.original.startedAt && s.original.endedAt
        ? Math.floor(
            (s.original.endedAt.getTime() - s.original.startedAt.getTime()) / 60000,
          )
        : null;

    console.log(`  ${s.sessionId}`);
    console.log(`    ${s.usuario} <${s.email}>  |  ${s.correcoes} correcao(oes)`);
    console.log(
      `    agora   : ${hora(s.atual.startedAt)} -> ${hora(s.atual.endedAt)}  ${s.atual.durationMin}min  ${s.atual.status}  dia ${s.atual.dayKey}`,
    );
    console.log(
      `    original: ${hora(s.original.startedAt)} -> ${hora(s.original.endedAt)}  ${duracaoOriginal}min  ${s.original.status}`,
    );
    console.log('');
  }
  console.log('Para reverter uma:  npm run reverter-correcao -- <sessionId>');
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--confirmar');
  const sessionId = args.find((a) => !a.startsWith('--'));

  const prisma = new PrismaClient();
  try {
    if (args.includes('--listar')) {
      await listar(prisma);
      return;
    }

    if (!sessionId) {
      console.error(
        'uso: npm run reverter-correcao -- --listar\n' +
          '     npm run reverter-correcao -- <sessionId> [--confirmar]',
      );
      process.exit(1);
    }

    const r = await reverterCorrecao(prisma, sessionId, { aplicar });

    console.log(`Sessao ${r.sessionId} (${r.usuario})`);
    console.log(`  correcoes na trilha: ${r.correcoesDesfeitas}`);
    console.log(
      `  antes : ${hora(r.antes.startedAt)} -> ${hora(r.antes.endedAt)}  ${r.antes.durationMin}min  ${r.antes.status}  dia ${r.antes.dayKey}`,
    );
    console.log(
      `  depois: ${hora(r.depois.startedAt)} -> ${hora(r.depois.endedAt)}  ${r.depois.durationMin}min  ${r.depois.status}  dia ${r.depois.dayKey}`,
    );

    if (r.aplicado) {
      console.log('\nAPLICADO. A reversao entrou na trilha como uma correcao nova.');
    } else {
      console.log('\nSIMULACAO -- nada foi escrito.');
      console.log(`Para aplicar: npm run reverter-correcao -- ${sessionId} --confirmar`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('Falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
