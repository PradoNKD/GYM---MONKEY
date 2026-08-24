import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    usersService = new UsersService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('normaliza nome (trim) e e-mail (trim + lowercase) antes de persistir', async () => {
      prisma.user.create.mockResolvedValue({ id: 'user-1' });

      await usersService.create({
        name: '  Fulano da Silva  ',
        email: '  Fulano@Example.COM  ',
        passwordHash: 'hash',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Fulano da Silva',
          email: 'fulano@example.com',
          passwordHash: 'hash',
        },
      });
    });
  });

  describe('findByEmail', () => {
    it('busca por e-mail exatamente como recebido (normalizacao e responsabilidade do chamador)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await usersService.findByEmail('ja-normalizado@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'ja-normalizado@example.com' },
      });
    });
  });

  describe('findById', () => {
    it('busca por id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await usersService.findById('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });

  describe('findAllPublic', () => {
    it('lista sem o passwordHash e com os inativos/mais antigos primeiro', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await usersService.findAllPublic();

      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.select.passwordHash).toBeUndefined();
      expect(arg.select).toMatchObject({
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      });
      expect(arg.orderBy).toEqual([{ active: 'asc' }, { createdAt: 'asc' }]);
    });
  });

  describe('updateAccess', () => {
    it('atualiza active/role e retorna sem o passwordHash', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1' });

      await usersService.updateAccess('user-1', { active: true });

      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'user-1' });
      expect(arg.data).toEqual({ active: true });
      expect(arg.select.passwordHash).toBeUndefined();
    });
  });
});
