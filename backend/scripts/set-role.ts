import { PrismaClient, Role } from '@prisma/client';

/**
 * Bootstrap manual de papel/acesso de um usuario. Nao existe auto-promocao via
 * API de proposito (seria uma brecha), entao o primeiro supervisor e criado
 * por aqui.
 *
 * Uso:
 *   npm run set-role -- <email> <USER|SUPERVISOR>
 *
 * Sempre marca o usuario como active=true (o objetivo e liberar o acesso).
 * Roda contra o banco apontado por DATABASE_URL (o .env local, ou defina a
 * variavel pra mirar o Neon).
 */
async function main() {
  const [email, roleArg] = process.argv.slice(2);

  if (!email || !roleArg) {
    console.error('uso: npm run set-role -- <email> <USER|SUPERVISOR>');
    process.exit(1);
  }

  const role = roleArg.toUpperCase();
  if (role !== Role.USER && role !== Role.SUPERVISOR) {
    console.error(`role invalido: "${roleArg}" (use USER ou SUPERVISOR)`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email: email.trim().toLowerCase() },
      data: { role: role as Role, active: true },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    console.log('Atualizado:', user);
  } catch (error) {
    console.error('Falhou:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
