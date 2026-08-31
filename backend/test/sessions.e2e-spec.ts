import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConquistasService } from '../src/sessions/conquistas.service';
import { SemanasService } from '../src/sessions/semanas.service';
import { SessionsService } from '../src/sessions/sessions.service';

// Relogio compartilhado: SessionsService e SemanasService tem de enxergar o
// MESMO "agora", senao fechar a semana olharia para a data real enquanto os
// treinos foram gravados na data congelada.
class Relogio {
  instante = new Date('2026-08-26T12:00:00Z');
}

class SemanasServiceComRelogio extends SemanasService {
  constructor(
    prisma: PrismaService,
    private readonly relogio: Relogio,
  ) {
    super(prisma);
  }

  protected agora(): Date {
    return this.relogio.instante;
  }
}

class ConquistasServiceComRelogio extends ConquistasService {
  constructor(
    prisma: PrismaService,
    private readonly relogio: Relogio,
  ) {
    super(prisma);
  }

  protected agora(): Date {
    return this.relogio.instante;
  }
}

// Servico com relogio controlado: as regras dependem de tempo (cooldown,
// duracao minima, auto-encerramento), entao congelar o "agora" e o que permite
// testar o comportamento real sem esperar horas.
class SessionsServiceComRelogio extends SessionsService {
  constructor(
    prisma: PrismaService,
    private readonly relogio = new Relogio(),
  ) {
    super(
      prisma,
      new SemanasServiceComRelogio(prisma, relogio),
      new ConquistasServiceComRelogio(prisma, relogio),
    );
  }

  protected agora(): Date {
    return this.relogio.instante;
  }

  em(iso: string) {
    this.relogio.instante = new Date(iso);
  }

  avancarMin(min: number) {
    this.relogio.instante = new Date(this.relogio.instante.getTime() + min * 60000);
  }
}

describe('SessionsService - regras de integridade (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessoes: SessionsServiceComRelogio;
  const criados: string[] = [];

  async function novoUsuario(timezone = 'America/Sao_Paulo') {
    const u = await prisma.user.create({
      data: {
        name: 'Fulano',
        email: `s-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'x',
        active: true,
        timezone,
      },
    });
    criados.push(u.id);
    return u;
  }

  // Registra um treino completo num dia, ja passando o cooldown depois.
  async function treinar(userId: string, diaIso: string, minutos: number) {
    sessoes.em(diaIso);
    await sessoes.abrir(userId);
    sessoes.avancarMin(minutos);
    return sessoes.fechar(userId);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    sessoes = new SessionsServiceComRelogio(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await app.close();
  });

  describe('o furo relatado: treinos de 1 segundo', () => {
    it('cinco sessoes de 1 segundo no mesmo dia nao contam nada', async () => {
      const u = await novoUsuario();

      for (let i = 0; i < 5; i++) {
        await sessoes.abrir(u.id);
        await sessoes.fechar(u.id); // fecha no mesmo instante: duracao 0
        sessoes.avancarMin(31); // passa o cooldown, o pior caso possivel
      }

      expect(await sessoes.streak(u.id)).toBe(0);
      expect(await sessoes.resumoSemanal(u.id)).toEqual({ treinos: 0, minutos: 0 });

      // As sessoes existem no historico -- so nao contam.
      const todas = await prisma.workoutSession.findMany({ where: { userId: u.id } });
      expect(todas).toHaveLength(5);
      expect(todas.every((s) => s.status === SessionStatus.SHORT)).toBe(true);
    });

    it('sem esperar o cooldown, a rajada nem comeca', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);
      await sessoes.fechar(u.id);

      await expect(sessoes.abrir(u.id)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cooldown de 30 min', () => {
    it('barra antes dos 30 min, dizendo quanto falta', async () => {
      const u = await novoUsuario();
      await treinar(u.id, '2026-08-26T12:00:00Z', 30);

      sessoes.avancarMin(29);
      await expect(sessoes.abrir(u.id)).rejects.toThrow(/Aguarde 1 min/);
    });

    it('libera depois dos 30 min', async () => {
      const u = await novoUsuario();
      await treinar(u.id, '2026-08-26T12:00:00Z', 30);

      sessoes.avancarMin(30);
      expect((await sessoes.abrir(u.id)).status).toBe(SessionStatus.OPEN);
    });
  });

  describe('duracao minima e maxima', () => {
    it('19 min fica SHORT', async () => {
      const u = await novoUsuario();

      expect((await treinar(u.id, '2026-08-26T12:00:00Z', 19)).status).toBe(
        SessionStatus.SHORT,
      );
    });

    it('20 min ja conta', async () => {
      const u = await novoUsuario();
      const s = await treinar(u.id, '2026-08-26T12:00:00Z', 20);

      expect(s.status).toBe(SessionStatus.COMPLETED);
      expect(s.durationMin).toBe(20);
    });

    it('treino de 5h e truncado em 4h, mas continua valendo como treino', async () => {
      const u = await novoUsuario();
      // 5h e menos que o auto-encerramento (6h), entao quem fecha e a pessoa.
      const s = await treinar(u.id, '2026-08-26T12:00:00Z', 5 * 60);

      expect(s.status).toBe(SessionStatus.COMPLETED);
      expect(s.durationMin).toBe(4 * 60);
      expect(await sessoes.streak(u.id)).toBe(1);
    });
  });

  describe('auto-encerramento em 6h', () => {
    it('sessao esquecida vira AUTO_CLOSED e nao conta', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);

      sessoes.avancarMin(6 * 60 + 1);
      await sessoes.fecharAbandonadas(u.id);

      const s = await prisma.workoutSession.findFirst({ where: { userId: u.id } });
      expect(s!.status).toBe(SessionStatus.AUTO_CLOSED);
      expect(s!.durationMin).toBe(6 * 60);
      expect(await sessoes.streak(u.id)).toBe(0);
    });

    it('sessao esquecida por tres dias nao vira treino de 72h', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);

      sessoes.avancarMin(3 * 24 * 60);
      await sessoes.fecharAbandonadas(u.id);

      const s = await prisma.workoutSession.findFirst({ where: { userId: u.id } });
      expect(s!.durationMin).toBe(6 * 60);
    });

    it('antes das 6h a sessao segue aberta', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);

      sessoes.avancarMin(5 * 60);
      expect(await sessoes.fecharAbandonadas(u.id)).toBe(0);
      expect((await sessoes.emAndamento(u.id))!.status).toBe(SessionStatus.OPEN);
    });

    it('depois do auto-encerramento da pra abrir outra', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);
      sessoes.avancarMin(6 * 60 + 60);

      expect((await sessoes.abrir(u.id)).status).toBe(SessionStatus.OPEN);
    });
  });

  describe('um treino aberto por vez', () => {
    it('abrir duas vezes e recusado', async () => {
      const u = await novoUsuario();
      await sessoes.abrir(u.id);

      await expect(sessoes.abrir(u.id)).rejects.toThrow(/em andamento/);
    });

    it('fechar sem ter aberto e recusado', async () => {
      const u = await novoUsuario();

      await expect(sessoes.fechar(u.id)).rejects.toThrow(/Nenhum treino/);
    });

    it('alternar abre e depois fecha, como o botao da tela', async () => {
      const u = await novoUsuario();

      expect((await sessoes.alternar(u.id)).status).toBe(SessionStatus.OPEN);
      sessoes.avancarMin(45);
      expect((await sessoes.alternar(u.id)).status).toBe(SessionStatus.COMPLETED);
    });
  });

  describe('um treino contavel por dia', () => {
    it('dois treinos validos no mesmo dia contam 1, somando os minutos', async () => {
      const u = await novoUsuario();

      await treinar(u.id, '2026-08-26T12:00:00Z', 60);
      sessoes.avancarMin(60); // passa o cooldown, ainda no mesmo dia
      await sessoes.abrir(u.id);
      sessoes.avancarMin(30);
      await sessoes.fechar(u.id);

      // 1 dia com treino, mas os 90 minutos aparecem somados.
      expect(await sessoes.resumoSemanal(u.id)).toEqual({ treinos: 1, minutos: 90 });
      expect(await sessoes.streak(u.id)).toBe(1);
    });

    it('sessao curta no mesmo dia nao soma minutos nem inventa treino', async () => {
      const u = await novoUsuario();

      await treinar(u.id, '2026-08-26T12:00:00Z', 45);
      sessoes.avancarMin(31);
      await sessoes.abrir(u.id);
      sessoes.avancarMin(5); // curta
      await sessoes.fechar(u.id);

      expect(await sessoes.resumoSemanal(u.id)).toEqual({ treinos: 1, minutos: 45 });
    });
  });

  describe('streak e semana no fuso do usuario', () => {
    it('treino as 22h em Sao Paulo conta no dia certo, nao no seguinte', async () => {
      const u = await novoUsuario('America/Sao_Paulo');

      // 01:00 UTC do dia 27 = 22:00 do dia 26 em Sao Paulo.
      await treinar(u.id, '2026-08-27T01:00:00Z', 60);

      const s = await prisma.workoutSession.findFirst({ where: { userId: u.id } });
      expect(s!.dayKey).toBe('2026-08-26');
    });

    it('tres dias seguidos dao streak 3', async () => {
      const u = await novoUsuario();

      for (const dia of ['2026-08-24', '2026-08-25', '2026-08-26']) {
        await treinar(u.id, `${dia}T15:00:00Z`, 45);
      }

      sessoes.em('2026-08-26T20:00:00Z');
      expect(await sessoes.streak(u.id)).toBe(3);
    });

    it('um dia de folga no meio quebra a sequencia', async () => {
      const u = await novoUsuario();

      for (const dia of ['2026-08-24', '2026-08-26']) {
        await treinar(u.id, `${dia}T15:00:00Z`, 45);
      }

      sessoes.em('2026-08-26T20:00:00Z');
      expect(await sessoes.streak(u.id)).toBe(1);
    });

    it('a streak sobrevive ao dia de hoje ainda sem treino', async () => {
      const u = await novoUsuario();
      await treinar(u.id, '2026-08-25T15:00:00Z', 45);

      // Hoje e 26 e ainda nao treinou: a sequencia de ontem continua valendo.
      sessoes.em('2026-08-26T09:00:00Z');
      expect(await sessoes.streak(u.id)).toBe(1);
    });

    it('a semana ISO nao mistura o domingo anterior com a semana atual', async () => {
      const u = await novoUsuario();

      // Domingo 23/08 fecha a semana anterior; segunda 24/08 abre a atual.
      for (const dia of ['2026-08-23', '2026-08-24']) {
        await treinar(u.id, `${dia}T15:00:00Z`, 50);
      }

      sessoes.em('2026-08-26T15:00:00Z');
      expect(await sessoes.resumoSemanal(u.id)).toEqual({ treinos: 1, minutos: 50 });
    });
  });

  describe('timestamps e grupo', () => {
    it('o horario vem do servidor, nao do cliente', async () => {
      const u = await novoUsuario();

      sessoes.em('2026-08-26T12:00:00Z');
      const s = await sessoes.abrir(u.id);

      expect(s.startedAt.toISOString()).toBe('2026-08-26T12:00:00.000Z');
    });

    it('a sessao nasce vinculada ao grupo do usuario', async () => {
      const u = await novoUsuario();
      const grupo = await prisma.group.findUnique({ where: { slug: 'gym-monkey' } });
      await prisma.membership.create({ data: { userId: u.id, groupId: grupo!.id } });

      const s = await sessoes.abrir(u.id);
      expect(s.groupId).toBe(grupo!.id);
    });

    it('usuario inexistente da NotFound', async () => {
      await expect(
        sessoes.abrir('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(/nao encontrado/);
    });
  });
});
