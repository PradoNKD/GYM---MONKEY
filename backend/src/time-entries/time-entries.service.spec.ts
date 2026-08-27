import { PrismaService } from '../prisma/prisma.service';
import { TimeEntriesService } from './time-entries.service';

// O servico ficou somente-leitura na auditoria de seguranca de 2026-08-27:
// `toggle`, `update` e `remove` sairam junto com as rotas de escrita. Registrar
// treino e corrigir horario vivem em SessionsService, com auditoria.
describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let prisma: { timeEntry: { findMany: jest.Mock } };

  const userId = 'user-1';

  beforeEach(() => {
    prisma = { timeEntry: { findMany: jest.fn() } };
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

  it('nao expoe mais nenhum metodo de escrita', () => {
    // Trava de regressao: reintroduzir escrita aqui reabre o furo de historico
    // editavel e apagavel sem rastro que a v0.9 fechou.
    const metodos = Object.getOwnPropertyNames(TimeEntriesService.prototype);

    expect(metodos.sort()).toEqual(['constructor', 'findAllForUser']);
  });
});
