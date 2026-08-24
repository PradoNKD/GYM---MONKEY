import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Campos seguros pra devolver numa listagem (nunca o passwordHash).
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { name: string; email: string; passwordHash: string }) {
    return this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
      },
    });
  }

  findAllPublic() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ active: 'asc' }, { createdAt: 'asc' }],
    });
  }

  updateAccess(id: string, data: { active?: boolean; role?: Role }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
  }
}
