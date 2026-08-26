// Converte o historico antigo (TimeEntry) em WorkoutSession.
//
// Rodar: npm run backfill-sessoes
// Em producao: DATABASE_URL apontando pro Neon.
//
// E idempotente: usuario que ja tem sessao de backfill e pulado, entao rodar
// duas vezes nao duplica nada. Os TimeEntry nao sao apagados -- seguem como
// auditoria da epoca anterior.
import { PrismaClient } from '@prisma/client';
import { converterTimeEntriesEmSessoes } from '../src/sessions/backfill';

async function main() {
  const prisma = new PrismaClient();
  try {
    const relatorio = await converterTimeEntriesEmSessoes(prisma);
    console.log('Backfill concluido:', relatorio);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('Falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
