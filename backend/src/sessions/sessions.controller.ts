import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CorrigirSessaoDto } from './dto/corrigir-sessao.dto';
import { ListarSessoesDto } from './dto/listar-sessoes.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // Historico paginado + streak e resumo da semana ja calculados no servidor,
  // pra a tela nao ter de reimplementar (nem poder burlar) as regras.
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListarSessoesDto) {
    return this.sessionsService.historicoComResumo(user.id, {
      cursor: query.cursor,
      limite: query.limite,
    });
  }

  // Um botao so, como a tela de hoje. Nao recebe horario: quem marca e o servidor.
  @Post('toggle')
  toggle(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionsService.alternar(user.id);
  }

  @Patch(':id')
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrigirSessaoDto,
  ) {
    return this.sessionsService.corrigir(user.id, id, dto, user.role === Role.SUPERVISOR);
  }

  @Get(':id/corrections')
  corrections(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessionsService.correcoes(user.id, id, user.role === Role.SUPERVISOR);
  }
}
