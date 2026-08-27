import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role, SessionStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Os tokens sao assinados direto pelo JwtService, sem passar por /auth/login:
// assim o rate limit do /auth (5/min) nao interfere e o teste fica sobre os
// endpoints de sessao, que e o que interessa aqui.
describe('Sessions API (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let jwt: JwtService;
  const criados: string[] = [];

  async function novoUsuario(role: Role = Role.USER) {
    const user = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `api-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
        role,
      },
    });
    criados.push(user.id);
    return { user, token: jwt.sign({ sub: user.id }) };
  }

  // Cria sessoes prontas no banco, pra testar listagem sem depender de tempo real.
  async function semearSessoes(userId: string, quantas: number) {
    for (let i = 0; i < quantas; i++) {
      const inicio = new Date(Date.UTC(2026, 7, 1 + i, 12, 0, 0));
      await prisma.workoutSession.create({
        data: {
          userId,
          startedAt: inicio,
          endedAt: new Date(inicio.getTime() + 60 * 60000),
          durationMin: 60,
          status: SessionStatus.COMPLETED,
          dayKey: inicio.toISOString().slice(0, 10),
        },
      });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  describe('autenticacao', () => {
    it('GET /sessions sem token -> 401', async () => {
      await request(server).get('/sessions').expect(401);
    });

    it('POST /sessions/toggle sem token -> 401', async () => {
      await request(server).post('/sessions/toggle').expect(401);
    });
  });

  describe('GET /sessions', () => {
    it('devolve historico, cursor e o resumo calculado no servidor', async () => {
      const { user, token } = await novoUsuario();
      await semearSessoes(user.id, 3);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body.itens).toHaveLength(3);
      expect(r.body.proximoCursor).toBeNull();
      expect(r.body.resumo).toMatchObject({
        streak: expect.any(Number),
        semana: { treinos: expect.any(Number), minutos: expect.any(Number) },
      });
      // A resposta diz se a sessao conta, pra a tela nao reimplementar a regra.
      expect(r.body.itens[0]).toMatchObject({ contavel: true, status: 'COMPLETED' });
    });

    it('nao devolve o passwordHash nem dados de outra pessoa', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      await semearSessoes(a.user.id, 2);
      await semearSessoes(b.user.id, 1);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${a.token}`)
        .expect(200);

      expect(r.body.itens).toHaveLength(2);
      expect(JSON.stringify(r.body)).not.toContain('passwordHash');
    });

    it('pagina por cursor sem repetir nem pular registros', async () => {
      const { user, token } = await novoUsuario();
      await semearSessoes(user.id, 5);

      const p1 = await request(server)
        .get('/sessions?limite=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(p1.body.itens).toHaveLength(2);
      expect(p1.body.proximoCursor).not.toBeNull();

      const p2 = await request(server)
        .get(`/sessions?limite=2&cursor=${p1.body.proximoCursor}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const p3 = await request(server)
        .get(`/sessions?limite=2&cursor=${p2.body.proximoCursor}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ids = [...p1.body.itens, ...p2.body.itens, ...p3.body.itens].map(
        (s: { id: string }) => s.id,
      );
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5); // nenhum repetido
      expect(p3.body.proximoCursor).toBeNull();
    });

    it('vem da mais recente pra mais antiga', async () => {
      const { user, token } = await novoUsuario();
      await semearSessoes(user.id, 3);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const datas = r.body.itens.map((s: { startedAt: string }) => s.startedAt);
      expect([...datas].sort().reverse()).toEqual(datas);
    });

    it('rejeita limite fora da faixa e cursor que nao e uuid', async () => {
      const { token } = await novoUsuario();

      await request(server)
        .get('/sessions?limite=999')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(server)
        .get('/sessions?cursor=nao-e-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejeita parametro desconhecido na query', async () => {
      const { token } = await novoUsuario();

      await request(server)
        .get('/sessions?ordem=asc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('POST /sessions/toggle', () => {
    it('abre e depois fecha o treino, sem receber horario do cliente', async () => {
      const { token } = await novoUsuario();

      const abriu = await request(server)
        .post('/sessions/toggle')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(abriu.body.status).toBe('OPEN');
      expect(abriu.body.startedAt).toBeDefined();

      const fechou = await request(server)
        .post('/sessions/toggle')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      // Fechou na hora: duracao 0, entao nao conta.
      expect(fechou.body.status).toBe('SHORT');
    });

    it('a rajada de toggles nao gera treino contabil e trava no cooldown', async () => {
      const { user, token } = await novoUsuario();

      await request(server).post('/sessions/toggle').set('Authorization', `Bearer ${token}`);
      await request(server).post('/sessions/toggle').set('Authorization', `Bearer ${token}`);

      // Terceiro toggle tentaria abrir de novo: barrado pelo cooldown.
      const terceiro = await request(server)
        .post('/sessions/toggle')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(terceiro.body.message).toMatch(/Aguarde/);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(r.body.resumo.semana).toEqual({ treinos: 0, minutos: 0 });
      expect(r.body.resumo.streak).toBe(0);

      const todas = await prisma.workoutSession.findMany({ where: { userId: user.id } });
      expect(todas).toHaveLength(1);
    });

    it('ignora horario mandado pelo cliente no corpo', async () => {
      const { token } = await novoUsuario();

      // forbidNonWhitelisted faria 400 se o endpoint tivesse DTO; aqui o corpo
      // simplesmente nao e lido -- o importante e o horario ser do servidor.
      const r = await request(server)
        .post('/sessions/toggle')
        .set('Authorization', `Bearer ${token}`)
        .send({ startedAt: '2020-01-01T00:00:00.000Z' })
        .expect(201);

      expect(new Date(r.body.startedAt).getFullYear()).toBeGreaterThan(2020);
    });
  });

  describe('PATCH /sessions/:id (correcao auditada)', () => {
    async function sessaoFechada(userId: string, horasAtras = 3) {
      const inicio = new Date(Date.now() - horasAtras * 60 * 60000);
      return prisma.workoutSession.create({
        data: {
          userId,
          startedAt: inicio,
          endedAt: new Date(inicio.getTime() + 10 * 60000),
          durationMin: 10,
          status: SessionStatus.SHORT,
          dayKey: '2026-08-26',
        },
      });
    }

    it('corrige o fim, reclassifica e grava a auditoria', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);
      const fimNovo = new Date(s.startedAt.getTime() + 90 * 60000);

      const r = await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: fimNovo.toISOString(), reason: 'Esqueci de finalizar' })
        .expect(200);

      // De SHORT (10 min) pra COMPLETED (90 min): a correcao passa pelas regras.
      expect(r.body).toMatchObject({ status: 'COMPLETED', durationMin: 90, contavel: true });

      const auditoria = await prisma.sessionCorrection.findMany({ where: { sessionId: s.id } });
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0]).toMatchObject({
        authorId: user.id,
        reason: 'Esqueci de finalizar',
        statusBefore: SessionStatus.SHORT,
        statusAfter: SessionStatus.COMPLETED,
      });
    });

    it('a correcao nao burla a duracao minima', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      const r = await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endedAt: new Date(s.startedAt.getTime() + 5 * 60000).toISOString(),
          reason: 'Ajuste pequeno',
        })
        .expect(200);

      expect(r.body).toMatchObject({ status: 'SHORT', contavel: false });
    });

    describe('travas contra reescrita de historico', () => {
      // Antes destas, a correcao era o caminho pra FABRICAR treino. Medido no
      // ambiente de dev: uma sessao de 3 minutos de hoje reescrita como 62
      // minutos num dia do passado levou a streak de 1 pra 3 e a semana de 2
      // pra 3 treinos, com duas correcoes na mesma sessao. A auditoria
      // registrava tudo e nao impedia nada.

      it('usuario comum nao pode mexer no inicio (e o inicio que define o DIA)', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);
        const outroDia = new Date(s.startedAt.getTime() - 9 * 24 * 60 * 60000);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            startedAt: outroDia.toISOString(),
            endedAt: new Date(outroDia.getTime() + 62 * 60000).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(400);

        // E o dia da sessao continua onde estava.
        const depois = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
        expect(depois.dayKey).toBe(s.dayKey);
        expect(depois.startedAt.toISOString()).toBe(s.startedAt.toISOString());
      });

      it('uma correcao por sessao: a segunda e recusada', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 60 * 60000).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(200);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 90 * 60000).toISOString(),
            reason: 'Mudei de ideia',
          })
          .expect(400);

        const auditoria = await prisma.sessionCorrection.findMany({ where: { sessionId: s.id } });
        expect(auditoria).toHaveLength(1);
      });

      it('o fim nao pode ir alem da janela de 6h do inicio', async () => {
        // Sem esta trava, por o fim dias depois fazia a duracao ser truncada no
        // teto de 4h e a sessao virar COMPLETED: qualquer toque de 1 segundo
        // virava treino contavel de 4 horas.
        const { user, token } = await novoUsuario();
        // 24h atras de proposito: com a sessao de 3h atras, inicio+7h cairia no
        // FUTURO e quem rejeitaria seria a regra de futuro -- o teste passaria
        // sem a janela existir. Foi assim que ele passou numa mutacao.
        const s = await sessaoFechada(user.id, 24);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 7 * 60 * 60000).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(400);

        // Confere QUAL regra barrou, nao so que barrou.
        expect(JSON.stringify(r.body)).toContain('6h do inicio');
      });

      it('aceita o fim dentro da janela, atravessando a meia-noite', async () => {
        // A janela e de 6h em vez de "tem de ser no mesmo dia" justamente por
        // isto: quem treina 23:30 e termina 00:30 atravessa a meia-noite.
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id, 24);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 5 * 60 * 60000).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(200);
      });

      it('a janela de 6h vale para o supervisor tambem', async () => {
        const { user } = await novoUsuario();
        const s = await sessaoFechada(user.id, 24);
        const sup = await novoUsuario(Role.SUPERVISOR);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${sup.token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 7 * 60 * 60000).toISOString(),
            reason: 'Ajustando',
          })
          .expect(400);

        expect(JSON.stringify(r.body)).toContain('6h do inicio');
      });

      it('supervisor PODE mexer no inicio, e fica auditado', async () => {
        const { user } = await novoUsuario();
        const s = await sessaoFechada(user.id);
        const sup = await novoUsuario(Role.SUPERVISOR);
        const inicioNovo = new Date(s.startedAt.getTime() - 60 * 60000);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${sup.token}`)
          .send({
            startedAt: inicioNovo.toISOString(),
            endedAt: new Date(inicioNovo.getTime() + 60 * 60000).toISOString(),
            reason: 'Corrigindo a pedido da pessoa',
          })
          .expect(200);

        const auditoria = await prisma.sessionCorrection.findMany({ where: { sessionId: s.id } });
        expect(auditoria).toHaveLength(1);
        expect(auditoria[0].authorId).toBe(sup.user.id);
        expect(auditoria[0].startedAtBefore?.toISOString()).toBe(s.startedAt.toISOString());
      });

      it('o supervisor nao fica preso ao limite de uma correcao', async () => {
        const { user } = await novoUsuario();
        const s = await sessaoFechada(user.id);
        const sup = await novoUsuario(Role.SUPERVISOR);

        for (const minutos of [60, 90]) {
          await request(server)
            .patch(`/sessions/${s.id}`)
            .set('Authorization', `Bearer ${sup.token}`)
            .send({
              endedAt: new Date(s.startedAt.getTime() + minutos * 60000).toISOString(),
              reason: `Ajuste para ${minutos} min`,
            })
            .expect(200);
        }

        const auditoria = await prisma.sessionCorrection.findMany({ where: { sessionId: s.id } });
        expect(auditoria).toHaveLength(2);
      });

      it('a listagem diz se o treino ainda e corrigivel', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        const antes = await request(server)
          .get('/sessions')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(antes.body.itens.find((i: any) => i.id === s.id).corrigivel).toBe(true);

        await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 60 * 60000).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(200);

        const depois = await request(server)
          .get('/sessions')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(depois.body.itens.find((i: any) => i.id === s.id).corrigivel).toBe(false);
      });
    });

    it('exige motivo', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: new Date().toISOString() })
        .expect(400);
    });

    it('recusa treino no futuro', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);
      const amanha = new Date(Date.now() + 24 * 60 * 60000);

      const r = await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: amanha.toISOString(), reason: 'Tentando trapacear' })
        .expect(400);
      expect(r.body.message).toMatch(/futuro/);
    });

    it('recusa fim antes do inicio', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endedAt: new Date(s.startedAt.getTime() - 60000).toISOString(),
          reason: 'Invertido',
        })
        .expect(400);
    });

    it('nao deixa corrigir treino de outra pessoa -> 403', async () => {
      const dono = await novoUsuario();
      const intruso = await novoUsuario();
      const s = await sessaoFechada(dono.user.id);

      await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${intruso.token}`)
        .send({ endedAt: new Date().toISOString(), reason: 'Nao e meu' })
        .expect(403);
    });

    it('supervisor pode corrigir treino de outra pessoa', async () => {
      const dono = await novoUsuario();
      const sup = await novoUsuario(Role.SUPERVISOR);
      const s = await sessaoFechada(dono.user.id);

      const r = await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${sup.token}`)
        .send({
          endedAt: new Date(s.startedAt.getTime() + 60 * 60000).toISOString(),
          reason: 'Corrigido pelo supervisor',
        })
        .expect(200);

      expect(r.body.durationMin).toBe(60);
      const auditoria = await prisma.sessionCorrection.findFirst({
        where: { sessionId: s.id },
      });
      // A auditoria registra QUEM corrigiu, nao o dono da sessao.
      expect(auditoria!.authorId).toBe(sup.user.id);
    });

    it('nao deixa corrigir sessao em andamento', async () => {
      const { user, token } = await novoUsuario();
      const aberta = await prisma.workoutSession.create({
        data: { userId: user.id, startedAt: new Date(), dayKey: '2026-08-26' },
      });

      await request(server)
        .patch(`/sessions/${aberta.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: new Date().toISOString(), reason: 'Ainda aberta' })
        .expect(400);
    });

    it('sessao inexistente -> 404 e id invalido -> 400', async () => {
      const { token } = await novoUsuario();

      await request(server)
        .patch('/sessions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: new Date().toISOString(), reason: 'Sumiu' })
        .expect(404);

      await request(server)
        .patch('/sessions/nao-e-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: new Date().toISOString(), reason: 'Id ruim' })
        .expect(400);
    });
  });

  describe('GET /sessions/:id/corrections', () => {
    it('lista a trilha de auditoria da sessao', async () => {
      const { user, token } = await novoUsuario();
      const inicio = new Date(Date.now() - 3 * 60 * 60000);
      const s = await prisma.workoutSession.create({
        data: {
          userId: user.id,
          startedAt: inicio,
          endedAt: new Date(inicio.getTime() + 30 * 60000),
          durationMin: 30,
          status: SessionStatus.COMPLETED,
          dayKey: '2026-08-26',
        },
      });

      await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endedAt: new Date(inicio.getTime() + 45 * 60000).toISOString(),
          reason: 'Primeira correcao',
        })
        .expect(200);

      const r = await request(server)
        .get(`/sessions/${s.id}/corrections`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body).toHaveLength(1);
      expect(r.body[0].reason).toBe('Primeira correcao');
    });

    it('nao mostra a auditoria de outra pessoa -> 403', async () => {
      const dono = await novoUsuario();
      const intruso = await novoUsuario();
      const s = await prisma.workoutSession.create({
        data: {
          userId: dono.user.id,
          startedAt: new Date(),
          dayKey: '2026-08-26',
          status: SessionStatus.COMPLETED,
        },
      });

      await request(server)
        .get(`/sessions/${s.id}/corrections`)
        .set('Authorization', `Bearer ${intruso.token}`)
        .expect(403);
    });
  });
});
