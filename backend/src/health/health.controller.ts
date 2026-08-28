import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { versaoDoBuild } from './versao';

/**
 * Health check publico (nao passa pelo JwtAuthGuard). A plataforma de deploy
 * usa isso pra saber se o container esta pronto antes de mandar trafego.
 *
 * Faz um ping no banco: se o Postgres nao responder, retorna 503 e o deploy
 * segura o trafego em vez de mandar usuario pra um app que nao consegue ler
 * dado nenhum.
 *
 * Devolve tambem QUAL build esta no ar. Sem isso, confirmar se um deploy pegou
 * uma regra que so vale para usuario comum exigia criar conta de teste em
 * producao -- e a API nao sabe apagar usuario. Ver `versao.ts`.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }

    return { status: 'ok', database: 'up', version: versaoDoBuild() };
  }
}
