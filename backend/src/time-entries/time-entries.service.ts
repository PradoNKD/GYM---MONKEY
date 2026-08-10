import { Injectable } from '@nestjs/common';
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
