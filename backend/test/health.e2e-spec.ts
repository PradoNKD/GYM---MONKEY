import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health check (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 200 sem exigir autenticacao', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  // Fora do Render a variavel do commit nao existe, entao aqui o valor cai no
  // fallback. O que importa e o campo existir sempre: e ele que responde "o
  // deploy pegou?" sem precisar de conta de teste em producao.
  it('diz qual build esta no ar', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.version).toBe('desconhecida');
  });
});
