import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalvarSeriesDto } from './dto/salvar-series.dto';
import { ExerciciosService } from './exercicios.service';

/**
 * Registro de exercicios e series -- a Fase B.
 *
 * Rotas separadas das de sessao pelo mesmo motivo que o `PATCH
 * /sessions/:id/registro` da Fase A: **isto e anotacao, nao contagem**. Serie e
 * carga nao decidem streak, meta nem dayKey, entao nao passam pela trava de
 * correcao (uma por sessao, teto de +1h) e podem ser editadas a vontade.
 *
 * Elas tambem precisam funcionar com o treino ABERTO, e nao so no check-out:
 * ninguem lembra cinco exercicios com quatro series de memoria ao sair da
 * academia. Pedir no fim e o que faz abandonar diario de treino.
 */
@Controller('exercicios')
@UseGuards(JwtAuthGuard)
export class ExerciciosController {
  constructor(private readonly exercicios: ExerciciosService) {}

  /** O catalogo da pessoa, mais usados primeiro. Alimenta o autocompletar. */
  @Get()
  catalogo(@CurrentUser() user: AuthenticatedUser) {
    return this.exercicios.sugestoes(user.id);
  }

  /** Os pontos do grafico de um exercicio, com o recorde de carga. */
  @Get(':id/progressao')
  progressao(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exercicios.progressaoDe(user.id, id);
  }

  /**
   * A ultima vez que este exercicio apareceu num treino -- a base do "repetir".
   *
   * `ignorar` serve para o treino em andamento nao sugerir a si mesmo: sem ele,
   * assim que a primeira serie de hoje fosse salva, "a ultima vez" passaria a
   * ser hoje e a sugestao viraria um espelho.
   */
  @Get(':id/ultima-vez')
  ultimaVez(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('ignorar') ignorar?: string,
  ) {
    return this.exercicios.ultimaVez(user.id, id, ignorar);
  }

  /** O que foi registrado num treino, agrupado por exercicio. */
  @Get('treino/:sessionId')
  doTreino(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.exercicios.doTreino(user.id, sessionId);
  }

  /**
   * PUT, e nao POST, porque a operacao e idempotente: manda-se a lista final de
   * series daquele exercicio no treino, e repetir a mesma chamada nao duplica
   * nada. Na academia, com sinal ruim, isso importa.
   */
  @Put('treino/:sessionId')
  salvar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SalvarSeriesDto,
  ) {
    return this.exercicios.salvarSeries(user.id, sessionId, dto.exercicio, dto.series);
  }

  @Delete('treino/:sessionId/:exerciseId')
  remover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ) {
    return this.exercicios.removerExercicio(user.id, sessionId, exerciseId);
  }
}
