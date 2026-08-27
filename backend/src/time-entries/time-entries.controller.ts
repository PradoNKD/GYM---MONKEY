import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TimeEntriesService } from './time-entries.service';

/**
 * Somente leitura, de propósito.
 *
 * `TimeEntry` era o modelo antigo de ponto. Na v0.9 o app passou a registrar
 * treino em `WorkoutSession`, e estes registros ficaram como **auditoria** do
 * que existia antes do backfill -- por isso a leitura continua (a pessoa tem
 * direito de ver os próprios dados).
 *
 * As rotas de escrita (`POST /toggle`, `PATCH /:id`, `DELETE /:id`) foram
 * REMOVIDAS. Elas seguiram no ar depois do cutover da tela e permitiam, com um
 * token comum, reescrever o horário de um registro com valor vindo do cliente
 * (sem motivo e sem rastro) e apagar registros. Isso é exatamente a superfície
 * que a v0.9 existiu para eliminar: histórico que o próprio usuário edita e
 * apaga sem auditoria. Corrigir treino é `PATCH /sessions/:id`, que exige
 * motivo, revalida as regras de duração e grava o antes/depois.
 *
 * Não reintroduzir escrita aqui.
 */
@Controller('time-entries')
@UseGuards(JwtAuthGuard)
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.timeEntriesService.findAllForUser(user.id);
  }
}
