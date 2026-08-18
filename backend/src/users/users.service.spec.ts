import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
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
});
