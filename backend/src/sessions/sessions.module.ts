import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConquistasService } from './conquistas.service';
import { SemanasService } from './semanas.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

// A tela ainda usa /time-entries; estes endpoints sobem em paralelo e a troca
// acontece no cutover do frontend.
@Module({
  imports: [PrismaModule],
  controllers: [SessionsController],
  providers: [SessionsService, SemanasService, ConquistasService],
  exports: [SessionsService, SemanasService, ConquistasService],
})
export class SessionsModule {}
