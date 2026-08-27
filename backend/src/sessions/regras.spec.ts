import { SessionStatus } from '@prisma/client';
import {
  baseParaAumento,
  classificar,
  cooldownRestante,
  DURACAO_MAX_MIN,
  DURACAO_MIN_MIN,
  ehContabil,
} from './regras';

describe('regras de integridade da sessao', () => {
  describe('classificar', () => {
    it('treino de 1 segundo (0 min) entra como SHORT e nao conta', () => {
      const r = classificar(0);

      expect(r.status).toBe(SessionStatus.SHORT);
      expect(ehContabil(r.status)).toBe(false);
    });

    it('abaixo do minimo e SHORT, guardando a duracao real', () => {
      expect(classificar(19)).toEqual({ status: SessionStatus.SHORT, durationMin: 19 });
    });

    it('exatamente no minimo já conta', () => {
      const r = classificar(DURACAO_MIN_MIN);

      expect(r).toEqual({ status: SessionStatus.COMPLETED, durationMin: 20 });
      expect(ehContabil(r.status)).toBe(true);
    });

    it('duracao normal passa intacta', () => {
      expect(classificar(75)).toEqual({ status: SessionStatus.COMPLETED, durationMin: 75 });
    });

    it('no maximo exato nao trunca', () => {
      expect(classificar(DURACAO_MAX_MIN)).toEqual({
        status: SessionStatus.COMPLETED,
        durationMin: 240,
      });
    });

    it('acima do maximo trunca os minutos MAS segue valendo como treino', () => {
      // Protege quem esqueceu o check-out: nao perde o treino, so nao ganha 18h.
      const r = classificar(18 * 60);

      expect(r).toEqual({ status: SessionStatus.COMPLETED, durationMin: DURACAO_MAX_MIN });
      expect(ehContabil(r.status)).toBe(true);
    });

    it('duracao negativa (relogio baguncado) nao virá numero negativo', () => {
      expect(classificar(-10)).toEqual({ status: SessionStatus.SHORT, durationMin: 0 });
    });
  });

  describe('ehContabil', () => {
    it('so COMPLETED conta', () => {
      expect(ehContabil(SessionStatus.COMPLETED)).toBe(true);
      expect(ehContabil(SessionStatus.SHORT)).toBe(false);
      expect(ehContabil(SessionStatus.AUTO_CLOSED)).toBe(false);
      expect(ehContabil(SessionStatus.OPEN)).toBe(false);
    });
  });

  describe('cooldownRestante', () => {
    const agora = new Date('2026-08-26T12:00:00Z');

    it('sem treino anterior, pode abrir', () => {
      expect(cooldownRestante(null, agora)).toBe(0);
    });

    it('logo depois de fechar, barra pelos 30 min', () => {
      expect(cooldownRestante(new Date('2026-08-26T11:59:00Z'), agora)).toBe(29);
    });

    it('passados 30 min, libera', () => {
      expect(cooldownRestante(new Date('2026-08-26T11:30:00Z'), agora)).toBe(0);
    });

    it('muito tempo depois segue liberado (nao fica negativo)', () => {
      expect(cooldownRestante(new Date('2026-08-25T08:00:00Z'), agora)).toBe(0);
    });
  });
});

describe('baseParaAumento', () => {
  it('usa a duracao gravada quando ela e uma medida real', () => {
    expect(
      baseParaAumento({ status: SessionStatus.COMPLETED, durationMin: 45 }),
    ).toBe(45);
    expect(baseParaAumento({ status: SessionStatus.SHORT, durationMin: 3 })).toBe(3);
  });

  it('trata AUTO_CLOSED como base ZERO, porque 6h ali e teto e nao medida', () => {
    // Sem isto, corrigir de 360 pra 360 seria "aumento zero" e entregaria uma
    // sessao contavel de 4 horas de graca a quem nunca tocou em finalizar.
    expect(
      baseParaAumento({ status: SessionStatus.AUTO_CLOSED, durationMin: 360 }),
    ).toBe(0);
  });

  it('base zero quando nao ha duracao gravada', () => {
    expect(baseParaAumento({ status: SessionStatus.OPEN, durationMin: null })).toBe(0);
  });
});
