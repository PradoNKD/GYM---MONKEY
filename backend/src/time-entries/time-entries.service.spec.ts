import { NotFoundException } from '@nestjs/common';
import { TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TimeEntriesService } from './time-entries.service';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let prisma: {
    timeEntry: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const userId = 'user-1';
  const otherUserId = 'user-2';

  beforeEach(() => {
    prisma = {
      timeEntry: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TimeEntriesService(prisma as unknown as PrismaService);
  });

  describe('findAllForUser', () => {
    it('busca somente registros do usuario, do mais recente para o mais antigo', async () => {
      prisma.timeEntry.findMany.mockResolvedValue([]);

      await service.findAllForUser(userId);

      expect(prisma.timeEntry.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    });
  });

  describe('toggle', () => {
    it('cria CHECK_IN quando o usuario nunca registrou nada', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue({ type: TimeEntryType.CHECK_IN });

      await service.toggle(userId);

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: { userId, type: TimeEntryType.CHECK_IN },
      });
    });

    it('cria CHECK_OUT quando o ultimo registro foi CHECK_IN', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({
        type: TimeEntryType.CHECK_IN,
      });

      await service.toggle(userId);

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: { userId, type: TimeEntryType.CHECK_OUT },
      });
    });

    it('cria CHECK_IN quando o ultimo registro foi CHECK_OUT', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({
        type: TimeEntryType.CHECK_OUT,
      });

      await service.toggle(userId);

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: { userId, type: TimeEntryType.CHECK_IN },
      });
    });

    it('considera apenas os registros do proprio usuario para decidir o proximo tipo', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await service.toggle(userId);

      expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('atualiza o horario quando o registro pertence ao usuario', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({ id: 'entry-1', userId });
      prisma.timeEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.update(userId, 'entry-1', '2026-08-18T09:00:00.000Z');

      expect(prisma.timeEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: { timestamp: new Date('2026-08-18T09:00:00.000Z') },
      });
    });

    it('lanca NotFoundException quando o registro nao existe', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue(null);

      await expect(
        service.update(userId, 'inexistente', '2026-08-18T09:00:00.000Z'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('lanca NotFoundException quando o registro pertence a outro usuario', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        userId: otherUserId,
      });

      await expect(
        service.update(userId, 'entry-1', '2026-08-18T09:00:00.000Z'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('remove o registro quando pertence ao usuario', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({ id: 'entry-1', userId });

      await service.remove(userId, 'entry-1');

      expect(prisma.timeEntry.delete).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
      });
    });

    it('lanca NotFoundException quando o registro nao existe', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.timeEntry.delete).not.toHaveBeenCalled();
    });

    it('lanca NotFoundException quando o registro pertence a outro usuario (nao deixa vazar nem apagar dado de outro usuario)', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        userId: otherUserId,
      });

      await expect(service.remove(userId, 'entry-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.timeEntry.delete).not.toHaveBeenCalled();
    });
  });
});
