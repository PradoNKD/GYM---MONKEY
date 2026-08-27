import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import {
  chavePorConta,
  LIMITE_POR_CONTA,
} from './auth/limite-por-conta.decorator';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([
      // Teto geral por IP. Vale por rota (a chave do throttler inclui
      // controller + handler), entao 30/min em cada endpoint.
      { name: 'default', ttl: 60_000, limit: 30 },
      // Limite por CONTA, so nas rotas marcadas com @LimitePorConta().
      // Existe porque contar login por IP transformava o rate limit em
      // negacao de servico contra o proprio grupo: na academia todos saem
      // pelo mesmo IP. Ver limite-por-conta.decorator.ts.
      {
        name: 'por-conta',
        ttl: 60_000,
        limit: 5,
        skipIf: (context) =>
          Reflect.getMetadata(LIMITE_POR_CONTA, context.getHandler()) !== true,
        getTracker: (req) => chavePorConta(req),
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    TimeEntriesModule,
    SessionsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
