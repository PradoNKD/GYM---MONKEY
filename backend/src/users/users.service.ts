import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Grupo criado pela primeira migration da v0.9. Hoje ha um grupo so, mas o
// modelo ja e multi-grupo, entao todo usuario novo precisa nascer vinculado --
// senao as sessoes dele ficam sem grupo e as consultas de grupo o ignoram.
export const GRUPO_PADRAO_SLUG = 'gym-monkey';

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

  async create(data: { name: string; email: string; passwordHash: string }) {
    const grupo = await this.prisma.group.findUnique({
      where: { slug: GRUPO_PADRAO_SLUG },
      select: { id: true },
    });

    return this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        // Vinculo criado junto com a conta, na mesma escrita. Se o grupo padrao
        // nao existir (base sem a migration), a conta ainda e criada: travar o
        // cadastro por causa disso seria pior do que ficar sem o vinculo.
        ...(grupo ? { memberships: { create: { groupId: grupo.id } } } : {}),
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
