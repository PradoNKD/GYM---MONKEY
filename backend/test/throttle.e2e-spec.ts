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

  async function registrar(email: string) {
    await request(server)
      .post('/auth/register')
      .send({ name: 'Throttle', email, password: 'senha1234' })
      .expect(201);
  }

  function loginErrado(email: string) {
    return request(server).post('/auth/login').send({ email, password: 'senhaErrada1' });
  }

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

  it('o limite do login e por CONTA, nao por IP: errar a senha de uma nao trava a outra', async () => {
    // Este e o cenario que motivou a mudanca. Na academia todo mundo sai pelo
    // mesmo IP; com o limite contado por IP, alguem errando a senha algumas
    // vezes travava o login dos outros -- negacao de servico contra o proprio
    // grupo. Aqui as duas contas vem do mesmo IP (127.0.0.1, supertest).
    const emailA = emailUnico('conta-a');
    const emailB = emailUnico('conta-b');
    await registrar(emailA);
    await registrar(emailB);

    // Esgota a cota da conta A.
    for (let i = 0; i < 5; i += 1) {
      await loginErrado(emailA).expect(401);
    }
    await loginErrado(emailA).expect(429);

    // A conta B, no MESMO IP, continua podendo tentar.
    await loginErrado(emailB).expect(401);
  });

  it('nao da cota nova ao variar maiusculas do e-mail', async () => {
    // Se a chave usasse o e-mail cru, alternar A@x.com / a@x.com daria 5
    // tentativas por variacao -- forca bruta de graca.
    const email = emailUnico('caixa-alta');
    await registrar(email);

    for (let i = 0; i < 5; i += 1) {
      await loginErrado(email).expect(401);
    }

    await loginErrado(email.toUpperCase()).expect(429);
  });

  it('mantem um teto por IP no login, mesmo trocando de e-mail (30/min)', async () => {
    // O limite por conta nao pode virar porta aberta: um unico IP rodando
    // e-mails diferentes ainda bate no throttler `default`.
    let bloqueado = false;

    for (let i = 0; i < 31; i += 1) {
      const resposta = await loginErrado(emailUnico(`teto-ip-${i}`));
      if (resposta.status === 429) {
        bloqueado = true;
        break;
      }
    }

    expect(bloqueado).toBe(true);
  });
});
