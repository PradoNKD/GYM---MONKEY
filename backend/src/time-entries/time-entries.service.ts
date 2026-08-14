import { Injectable, NotFoundException } from '@nestjs/common';
import { TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    return this.prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== userId) {
      throw new NotFoundException('Registro nao encontrado');
    }
    return entry;
  }

  async update(userId: string, id: string, timestamp: string) {
    await this.findOwnedOrThrow(userId, id);
    return this.prisma.timeEntry.update({
      where: { id },
      data: { timestamp: new Date(timestamp) },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwnedOrThrow(userId, id);
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  async toggle(userId: string) {
    const lastEntry = await this.prisma.timeEntry.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });

    const nextType =
      lastEntry?.type === TimeEntryType.CHECK_IN
        ? TimeEntryType.CHECK_OUT
        : TimeEntryType.CHECK_IN;

    return this.prisma.timeEntry.create({
      data: { userId, type: nextType },
    });
  }
}
