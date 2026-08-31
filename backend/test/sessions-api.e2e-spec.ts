import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role, SessionStatus, WorkoutType } from '@prisma/client';
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
    // Cenario do relato: a pessoa iniciou e finalizou quase na hora. Inicio 5h
    // atras pra que +4h ainda caia no passado (senao a regra de futuro barra
    // primeiro e o teste passaria pelo motivo errado).
    async function sessaoDeUmMinuto(userId: string) {
      const inicio = new Date(Date.now() - 5 * 60 * 60000);
      return prisma.workoutSession.create({
        data: {
          userId,
          startedAt: inicio,
          endedAt: new Date(inicio.getTime() + 60000),
          durationMin: 1,
          status: SessionStatus.SHORT,
          dayKey: '2026-08-26',
        },
      });
    }

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
      // 10 -> 65 min: +55, dentro do teto de aumento de 60 min. O que este
      // teste cobre e a reclassificacao SHORT -> COMPLETED e a auditoria.
      const fimNovo = new Date(s.startedAt.getTime() + 65 * 60000);

      const r = await request(server)
        .patch(`/sessions/${s.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endedAt: fimNovo.toISOString(), reason: 'Esqueci de finalizar' })
        .expect(200);

      // De SHORT (10 min) pra COMPLETED (90 min): a correcao passa pelas regras.
      expect(r.body).toMatchObject({ status: 'COMPLETED', durationMin: 65, contavel: true });

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

      it('aceita o fim atravessando a meia-noite', async () => {
        // A janela e de 6h em vez de "tem de ser no mesmo dia" justamente por
        // isto: quem treina 23:30 e termina 00:30 atravessa a meia-noite, e uma
        // regra de mesmo-dia barraria esse caso real.
        const { user, token } = await novoUsuario();
        const inicio = new Date(Date.UTC(2026, 7, 20, 23, 30)); // passado fixo
        const s = await prisma.workoutSession.create({
          data: {
            userId: user.id,
            startedAt: inicio,
            endedAt: new Date(inicio.getTime() + 60000),
            durationMin: 1,
            status: SessionStatus.SHORT,
            dayKey: '2026-08-20',
          },
        });
        criados.push(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            // 00:30 do dia seguinte: outro dia civil, 59 min de aumento.
            endedAt: new Date(Date.UTC(2026, 7, 21, 0, 30)).toISOString(),
            reason: 'Esqueci de finalizar',
          })
          .expect(200);

        expect(r.body.durationMin).toBe(60);
        expect(r.body.status).toBe('COMPLETED');
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

      it('o caso relatado em producao: 1 min NAO vira 4h contaveis', async () => {
        // Relatado em 2026-08-27: um usuario comum iniciou um treino e "colocou
        // 4h pra frente". A janela de 6h nao pegava, porque 4h cabe nela -- e
        // 4h e justamente o teto de duracao contavel. Medido antes da trava:
        // sessao de 1 min virou 240 min contaveis, semana de 0 pra 240.
        const { user, token } = await novoUsuario();
        const s = await sessaoDeUmMinuto(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 4 * 60 * 60000).toISOString(),
            reason: 'esqueci de finalizar',
          })
          .expect(400);

        expect(JSON.stringify(r.body)).toContain('no maximo 60 min');

        const depois = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
        expect(depois.durationMin).toBe(1);
        expect(depois.status).toBe(SessionStatus.SHORT);
      });

      it('mas aumentar dentro de 1h continua funcionando', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoDeUmMinuto(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 55 * 60000).toISOString(),
            reason: 'esqueci de finalizar',
          })
          .expect(200);

        expect(r.body).toMatchObject({ status: 'COMPLETED', durationMin: 55, contavel: true });
      });

      it('reduzir e livre: nao ha teto pra diminuir', async () => {
        // Reduzir nao infla numero nenhum, entao nao precisa de limite.
        const { user, token } = await novoUsuario();
        const inicio = new Date(Date.now() - 5 * 60 * 60000);
        const s = await prisma.workoutSession.create({
          data: {
            userId: user.id,
            startedAt: inicio,
            endedAt: new Date(inicio.getTime() + 240 * 60000),
            durationMin: 240,
            status: SessionStatus.COMPLETED,
            dayKey: '2026-08-26',
          },
        });
        criados.push(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(inicio.getTime() + 30 * 60000).toISOString(),
            reason: 'tinha esquecido de finalizar antes',
          })
          .expect(200);

        expect(r.body.durationMin).toBe(30);
      });

      it('AUTO_CLOSED nao vira 4h de graca: as 6h gravadas sao teto, nao medida', async () => {
        // O buraco sutil: em AUTO_CLOSED o durationMin gravado e o teto de 6h.
        // Se ele fosse a base do aumento, corrigir de 360 pra 360 seria "aumento
        // zero" e entregaria uma sessao contavel de 4h a quem nunca tocou em
        // finalizar. A base tem de ser zero.
        const { user, token } = await novoUsuario();
        const inicio = new Date(Date.now() - 8 * 60 * 60000);
        const s = await prisma.workoutSession.create({
          data: {
            userId: user.id,
            startedAt: inicio,
            endedAt: new Date(inicio.getTime() + 360 * 60000),
            durationMin: 360,
            status: SessionStatus.AUTO_CLOSED,
            dayKey: '2026-08-26',
          },
        });
        criados.push(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(inicio.getTime() + 300 * 60000).toISOString(),
            reason: 'esqueci de finalizar',
          })
          .expect(400);

        expect(JSON.stringify(r.body)).toContain('no maximo 60 min');
      });

      it('mede o aumento na duracao BRUTA, nao na truncada', async () => {
        // Sutil: `classificar` trunca em 240 min. Se o aumento fosse medido na
        // duracao ja truncada, esticar uma sessao de 200 min pra 300 daria um
        // "aumento" de 40 e passaria -- quando o aumento real e de 100.
        const { user, token } = await novoUsuario();
        const inicio = new Date(Date.now() - 8 * 60 * 60000);
        const s = await prisma.workoutSession.create({
          data: {
            userId: user.id,
            startedAt: inicio,
            endedAt: new Date(inicio.getTime() + 200 * 60000),
            durationMin: 200,
            status: SessionStatus.COMPLETED,
            dayKey: '2026-08-26',
          },
        });
        criados.push(user.id);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            endedAt: new Date(inicio.getTime() + 300 * 60000).toISOString(),
            reason: 'esqueci de finalizar',
          })
          .expect(400);

        expect(JSON.stringify(r.body)).toContain('no maximo 60 min');
      });

      it('supervisor nao tem esse teto', async () => {
        const { user } = await novoUsuario();
        const s = await sessaoDeUmMinuto(user.id);
        const sup = await novoUsuario(Role.SUPERVISOR);

        const r = await request(server)
          .patch(`/sessions/${s.id}`)
          .set('Authorization', `Bearer ${sup.token}`)
          .send({
            endedAt: new Date(s.startedAt.getTime() + 4 * 60 * 60000).toISOString(),
            reason: 'Confirmado com a pessoa',
          })
          .expect(200);

        expect(r.body.durationMin).toBe(240);
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
  describe('PUT /sessions/meta', () => {
    it('sem token -> 401', async () => {
      await request(server).put('/sessions/meta').send({ meta: 4 }).expect(401);
    });

    it('agenda a meta nova para a semana seguinte', async () => {
      const { token } = await novoUsuario();

      const r = await request(server)
        .put('/sessions/meta')
        .set('Authorization', `Bearer ${token}`)
        .send({ meta: 5 })
        .expect(200);

      // A meta em vigor NAO muda agora: trocar no meio da semana seria
      // reescrever a regra depois de ver o resultado.
      expect(r.body.meta).toBe(3);
      expect(r.body.metaAgendada.meta).toBe(5);
      expect(r.body.metaAgendada.validaDe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('recusa meta fora da faixa de 3 a 6 -> 400', async () => {
      const { token } = await novoUsuario();

      for (const meta of [2, 7, 0, -1]) {
        await request(server)
          .put('/sessions/meta')
          .set('Authorization', `Bearer ${token}`)
          .send({ meta })
          .expect(400);
      }
    });

    it('recusa meta que nao e inteiro -> 400', async () => {
      const { token } = await novoUsuario();

      await request(server)
        .put('/sessions/meta')
        .set('Authorization', `Bearer ${token}`)
        .send({ meta: 3.5 })
        .expect(400);
    });

    it('nao aceita campo estranho no corpo -> 400', async () => {
      const { token } = await novoUsuario();

      await request(server)
        .put('/sessions/meta')
        .set('Authorization', `Bearer ${token}`)
        .send({ meta: 4, streakSemanas: 99 })
        .expect(400);
    });
  });

  describe('GET /sessions/semanas', () => {
    it('sem token -> 401', async () => {
      await request(server).get('/sessions/semanas').expect(401);
    });

    it('a rota nao e confundida com /sessions/:id', async () => {
      const { token } = await novoUsuario();

      const r = await request(server)
        .get('/sessions/semanas')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(r.body)).toBe(true);
    });

    it('so devolve as semanas de quem pediu', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      await semearSessoes(a.user.id, 3);

      const r = await request(server)
        .get('/sessions/semanas')
        .set('Authorization', `Bearer ${b.token}`)
        .expect(200);

      expect(r.body).toEqual([]);
    });
  });

  describe('GET /sessions - resumo da meta', () => {
    it('entrega meta, streak de semanas e congelamentos', async () => {
      const { token } = await novoUsuario();

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body.resumo.meta).toMatchObject({
        meta: 3,
        treinos: 0,
        cumprida: false,
        streakSemanas: 0,
        tokens: 2,
        recomeco: false,
      });
      expect(r.body.resumo.meta.limites).toEqual({ metaMin: 3, metaMax: 6 });
      // A streak diaria continua, agora acompanhada do recorde.
      expect(r.body.resumo.recordeDiario).toBe(0);
    });
  });
  describe('PATCH /sessions/:id/registro (registro da Fase A)', () => {
    async function sessaoFechada(userId: string) {
      return prisma.workoutSession.create({
        data: {
          userId,
          startedAt: new Date('2026-08-26T12:00:00Z'),
          endedAt: new Date('2026-08-26T13:00:00Z'),
          durationMin: 60,
          status: SessionStatus.COMPLETED,
          dayKey: '2026-08-26',
        },
      });
    }

    it('sem token -> 401', async () => {
      const { user } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .send({ effort: 3 })
        .expect(401);
    });

    it('grava tipo, esforco e nota', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      const r = await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          workoutTypes: [WorkoutType.PEITO, WorkoutType.BRACOS],
          effort: 4,
          note: 'supino 4x10 com 40kg',
        })
        .expect(200);

      expect(r.body.workoutTypes).toEqual(['PEITO', 'BRACOS']);
      expect(r.body.effort).toBe(4);
      expect(r.body.note).toBe('supino 4x10 com 40kg');
    });

    // O bug mais caro possivel nesta tela: salvar o esforco e apagar a nota.
    it('mandar so um campo nao apaga os outros', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ workoutTypes: [WorkoutType.PERNAS], effort: 5, note: 'agachamento' })
        .expect(200);

      const r = await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ effort: 3 })
        .expect(200);

      expect(r.body.effort).toBe(3);
      expect(r.body.note).toBe('agachamento');
      expect(r.body.workoutTypes).toEqual(['PERNAS']);
    });

    it('null limpa o campo', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'errei', workoutTypes: [WorkoutType.CARDIO] })
        .expect(200);

      const r = await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: null, workoutTypes: null })
        .expect(200);

      expect(r.body.note).toBeNull();
      expect(r.body.workoutTypes).toEqual([]);
    });

    // A trava de correcao existe porque horario decide o que conta. Rotulo nao
    // decide nada, entao editar tem de ser livre -- senao consertar um erro de
    // digitacao custaria a unica correcao da sessao.
    it('editar quantas vezes quiser, sem gastar a correcao', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      for (const effort of [1, 2, 3, 4, 5]) {
        await request(server)
          .patch(`/sessions/${s.id}/registro`)
          .set('Authorization', `Bearer ${token}`)
          .send({ effort })
          .expect(200);
      }

      const r = await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ effort: 2 })
        .expect(200);

      // Nenhuma linha de auditoria: isto nao e correcao.
      expect(
        await prisma.sessionCorrection.count({ where: { sessionId: s.id } }),
      ).toBe(0);
      // E a sessao continua corrigivel: anotar nao consumiu esse direito.
      expect(r.body.corrigivel).toBe(true);
    });

    it('nao anota o treino de outra pessoa -> 403', async () => {
      const dono = await novoUsuario();
      const intruso = await novoUsuario();
      const s = await sessaoFechada(dono.user.id);

      await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${intruso.token}`)
        .send({ effort: 5 })
        .expect(403);
    });

    describe('validacao', () => {
      it('recusa esforco fora de 1..5', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        for (const effort of [0, 6, 2.5]) {
          await request(server)
            .patch(`/sessions/${s.id}/registro`)
            .set('Authorization', `Bearer ${token}`)
            .send({ effort })
            .expect(400);
        }
      });

      it('recusa tipo que nao existe', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        await request(server)
          .patch(`/sessions/${s.id}/registro`)
          .set('Authorization', `Bearer ${token}`)
          .send({ workoutTypes: ['CROSSFIT'] })
          .expect(400);
      });

      it('recusa mais tipos que o maximo', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        await request(server)
          .patch(`/sessions/${s.id}/registro`)
          .set('Authorization', `Bearer ${token}`)
          .send({ workoutTypes: ['PEITO', 'COSTAS', 'PERNAS', 'OMBROS'] })
          .expect(400);
      });

      it('recusa nota longa demais', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        await request(server)
          .patch(`/sessions/${s.id}/registro`)
          .set('Authorization', `Bearer ${token}`)
          .send({ note: 'a'.repeat(281) })
          .expect(400);
      });

      it('corpo vazio nao e erro, so nao muda nada', async () => {
        const { user, token } = await novoUsuario();
        const s = await sessaoFechada(user.id);

        await request(server)
          .patch(`/sessions/${s.id}/registro`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(200);
      });
    });

    it('o registro aparece na listagem e nos limites do resumo', async () => {
      const { user, token } = await novoUsuario();
      const s = await sessaoFechada(user.id);

      await request(server)
        .patch(`/sessions/${s.id}/registro`)
        .set('Authorization', `Bearer ${token}`)
        .send({ workoutTypes: [WorkoutType.COSTAS], effort: 3, note: 'remada' })
        .expect(200);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const item = r.body.itens.find((i: { id: string }) => i.id === s.id);
      expect(item).toMatchObject({
        workoutTypes: ['COSTAS'],
        effort: 3,
        note: 'remada',
      });
      expect(r.body.resumo.regras.registro).toEqual({
        tiposMax: 3,
        esforcoMin: 1,
        esforcoMax: 5,
        notaMax: 280,
      });
    });

    it('sessao sem registro vem com os campos vazios, nunca ausentes', async () => {
      const { user, token } = await novoUsuario();
      await sessaoFechada(user.id);

      const r = await request(server)
        .get('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body.itens[0]).toMatchObject({
        workoutTypes: [],
        effort: null,
        note: null,
      });
    });
  });
  describe('GET /sessions/mapa (grade do ano)', () => {
    it('sem token -> 401', async () => {
      await request(server).get('/sessions/mapa').expect(401);
    });

    it('a rota nao e confundida com /sessions/:id', async () => {
      const { token } = await novoUsuario();

      const r = await request(server)
        .get('/sessions/mapa')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body).toHaveProperty('dias');
      expect(r.body).toHaveProperty('total');
    });

    it('devolve so os dias com treino contavel, com contagem e minutos', async () => {
      const { user, token } = await novoUsuario();
      await prisma.workoutSession.createMany({
        data: [
          {
            userId: user.id,
            startedAt: new Date('2026-08-24T15:00:00Z'),
            endedAt: new Date('2026-08-24T16:00:00Z'),
            durationMin: 60,
            status: SessionStatus.COMPLETED,
            dayKey: '2026-08-24',
          },
          {
            userId: user.id,
            startedAt: new Date('2026-08-24T19:00:00Z'),
            endedAt: new Date('2026-08-24T19:40:00Z'),
            durationMin: 40,
            status: SessionStatus.COMPLETED,
            dayKey: '2026-08-24',
          },
          // Curta: fica no historico, fora da grade.
          {
            userId: user.id,
            startedAt: new Date('2026-08-25T15:00:00Z'),
            endedAt: new Date('2026-08-25T15:03:00Z'),
            durationMin: 3,
            status: SessionStatus.SHORT,
            dayKey: '2026-08-25',
          },
        ],
      });

      const r = await request(server)
        .get('/sessions/mapa')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(r.body.dias).toEqual([{ dia: '2026-08-24', treinos: 2, minutos: 100 }]);
      expect(r.body.total).toEqual({ dias: 1, treinos: 2, minutos: 100 });
    });

    // A regra que impede a grade de virar vergonha.
    it('a janela comeca no primeiro treino, nao em 1o de janeiro', async () => {
      const { user, token } = await novoUsuario();
      await prisma.workoutSession.create({
        data: {
          userId: user.id,
          startedAt: new Date('2026-08-26T15:00:00Z'),
          endedAt: new Date('2026-08-26T16:00:00Z'),
          durationMin: 60,
          status: SessionStatus.COMPLETED,
          dayKey: '2026-08-26',
        },
      });

      const r = await request(server)
        .get('/sessions/mapa')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Segunda da semana de 26/08.
      expect(r.body.inicio).toBe('2026-08-24');
    });

    it('nao mistura treino de outra pessoa', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      await semearSessoes(a.user.id, 3);

      const r = await request(server)
        .get('/sessions/mapa')
        .set('Authorization', `Bearer ${b.token}`)
        .expect(200);

      expect(r.body.dias).toEqual([]);
      expect(r.body.total.dias).toBe(0);
    });
  });
});
