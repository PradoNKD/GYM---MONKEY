import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Só leitura. Ver o comentário do controller: `TimeEntry` é o modelo antigo,
 * mantido como auditoria do que havia antes do backfill da v0.9. Os métodos de
 * escrita (`toggle`, `update`, `remove`) foram removidos junto com as rotas.
 */
@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    return this.prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }
}
