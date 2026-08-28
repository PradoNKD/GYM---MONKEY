import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlterarMetaDto } from './dto/alterar-meta.dto';
import { AnotarSessaoDto } from './dto/anotar-sessao.dto';
import { CorrigirSessaoDto } from './dto/corrigir-sessao.dto';
import { ListarSessoesDto } from './dto/listar-sessoes.dto';
import { SemanasService } from './semanas.service';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly semanasService: SemanasService,
  ) {}

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

  // Semanas ja fechadas. Vem depois do fechamento preguicoso, entao abrir esta
  // tela e o que "roda o job" de quem ficou uma semana sem entrar.
  @Get('semanas')
  weeks(@CurrentUser() user: AuthenticatedUser) {
    return this.semanasService.historico(user.id);
  }

  // Trocar a meta so vale da semana seguinte em diante -- a regra mora no
  // servico, a rota so encaminha.
  @Put('meta')
  setGoal(@CurrentUser() user: AuthenticatedUser, @Body() dto: AlterarMetaDto) {
    return this.semanasService.alterarMeta(user.id, dto.meta);
  }

  @Patch(':id')
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrigirSessaoDto,
  ) {
    return this.sessionsService.corrigir(user.id, id, dto, user.role === Role.SUPERVISOR);
  }

  // Registro da Fase A. Rota separada do PATCH /sessions/:id de proposito: la
  // e correcao de horario, auditada e limitada; aqui e rotulo, que nao entra em
  // conta nenhuma e pode ser editado a vontade.
  @Patch(':id/registro')
  annotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnotarSessaoDto,
  ) {
    return this.sessionsService.anotar(user.id, id, dto, user.role === Role.SUPERVISOR);
  }

  @Get(':id/corrections')
  corrections(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessionsService.correcoes(user.id, id, user.role === Role.SUPERVISOR);
  }
}
