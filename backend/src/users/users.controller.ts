import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupervisorGuard } from '../auth/supervisor.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// Todas as rotas exigem estar logado E ser supervisor.
@Controller('users')
@UseGuards(JwtAuthGuard, SupervisorGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.findAllPublic();
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const target = await this.usersService.findById(id);
    if (!target) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    // Trava anti-lockout: o supervisor nao pode se desativar nem se rebaixar,
    // pra nao se trancar pra fora do painel.
    if (id === actor.id && dto.active === false) {
      throw new ForbiddenException('Voce nao pode desativar a propria conta');
    }
    if (id === actor.id && dto.role !== undefined && dto.role !== Role.SUPERVISOR) {
      throw new ForbiddenException('Voce nao pode rebaixar a propria conta');
    }

    return this.usersService.updateAccess(id, {
      active: dto.active,
      role: dto.role,
    });
  }
}
