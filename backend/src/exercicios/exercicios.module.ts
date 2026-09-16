import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExerciciosController } from './exercicios.controller';
import { ExerciciosService } from './exercicios.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExerciciosController],
  providers: [ExerciciosService],
  exports: [ExerciciosService],
})
export class ExerciciosModule {}
