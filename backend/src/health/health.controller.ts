import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health check publico (nao passa pelo JwtAuthGuard). A plataforma de deploy
 * usa isso pra saber se o container esta pronto antes de mandar trafego.
 *
 * Faz um ping no banco: se o Postgres nao responder, retorna 503 e o deploy
 * segura o trafego em vez de mandar usuario pra um app que nao consegue ler
 * dado nenhum.
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

    return { status: 'ok', database: 'up' };
  }
}
