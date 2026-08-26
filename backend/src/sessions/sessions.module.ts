import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsService } from './sessions.service';

// Ainda sem controller: a v0.9 monta a fundacao. Os endpoints (GET /sessions
// paginado e o toggle) entram no passo seguinte, junto com a troca na tela.
@Module({
  imports: [PrismaModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
