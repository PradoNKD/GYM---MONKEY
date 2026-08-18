import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rate limiting em /auth (e2e)', () => {
  let app: INestApplication;
  let server: any;

  function emailUnico(prefixo: string) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Cada teste ganha sua propria instancia da aplicacao: o armazenamento do
  // ThrottlerGuard e em memoria por instancia, e reaproveitar a mesma app
  // entre os testes faria a contagem de um teste "vazar" para o proximo.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('permite 5 registros em 60s e bloqueia o 6º com 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(server)
        .post('/auth/register')
        .send({
          name: `Throttle ${i}`,
          email: emailUnico(`throttle-register-${i}`),
          password: 'senha1234',
        })
        .expect(201);
    }

    await request(server)
      .post('/auth/register')
      .send({
        name: 'Throttle 6',
        email: emailUnico('throttle-register-6'),
        password: 'senha1234',
      })
      .expect(429);
  });

  it('permite 5 tentativas de login em 60s e bloqueia a 6ª com 429', async () => {
    const email = emailUnico('throttle-login');
    await request(server)
      .post('/auth/register')
      .send({ name: 'Throttle Login', email, password: 'senha1234' })
      .expect(201);

    for (let i = 0; i < 5; i += 1) {
      await request(server)
        .post('/auth/login')
        .send({ email, password: 'senhaErrada1' })
        .expect(401);
    }

    await request(server)
      .post('/auth/login')
      .send({ email, password: 'senhaErrada1' })
      .expect(429);
  });
});
