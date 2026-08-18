import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atras do proxy do Railway o IP real do cliente vem em X-Forwarded-For.
  // Sem confiar no primeiro proxy, o rate limiting (ThrottlerModule, por IP)
  // veria todos os requests com o mesmo IP do proxy - ou limitava todo mundo
  // junto, ou ficava inutil. 1 = confia so no primeiro proxy da frente.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  // Bind em 0.0.0.0 para o container aceitar conexoes externas (nao so localhost).
  await app.listen(port, '0.0.0.0');
  console.log(`API rodando na porta ${port}`);
}

bootstrap();
