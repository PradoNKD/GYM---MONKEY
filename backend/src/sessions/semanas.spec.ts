import { WeekStatus } from '@prisma/client';
import {
  ESTADO_INICIAL,
  EstadoSemanal,
  fecharSemana,
  metaValida,
  TOKENS_MAX,
  trimestreDe,
} from './semanas';

// Segundas-feiras usadas nos cenarios (2026).
const S1 = '2026-08-03';
const S2 = '2026-08-10';
const S3 = '2026-08-17';
const S4 = '2026-08-24';

function comEstado(parcial: Partial<EstadoSemanal>): EstadoSemanal {
  return { ...ESTADO_INICIAL, ...parcial };
}

/** Encadeia varias semanas, como o fechamento preguicoso faz de verdade. */
function rodar(
  inicial: EstadoSemanal,
  semanas: { semanaInicio: string; meta: number; treinos: number }[],
) {
  let estado = inicial;
  const resultados = semanas.map((s) => {
    const passo = fecharSemana(estado, s);
    estado = passo.estado;
    return passo.resultado;
  });

  return { estado, resultados };
}

describe('trimestreDe', () => {
  it('agrupa os meses de tres em tres', () => {
    expect(trimestreDe('2026-01-05')).toBe('2026-T1');
    expect(trimestreDe('2026-03-30')).toBe('2026-T1');
    expect(trimestreDe('2026-04-01')).toBe('2026-T2');
    expect(trimestreDe('2026-08-24')).toBe('2026-T3');
    expect(trimestreDe('2026-12-28')).toBe('2026-T4');
  });

  it('separa trimestres de anos diferentes', () => {
    expect(trimestreDe('2026-01-05')).not.toBe(trimestreDe('2027-01-04'));
  });
});

describe('metaValida', () => {
  it('aceita de 3 a 6', () => {
    expect(metaValida(3)).toBe(true);
    expect(metaValida(6)).toBe(true);
  });

  it('recusa fora da faixa e nao-inteiros', () => {
    expect(metaValida(2)).toBe(false);
    expect(metaValida(7)).toBe(false);
    expect(metaValida(3.5)).toBe(false);
  });
});

describe('fecharSemana', () => {
  describe('cumpriu a meta', () => {
    it('avanca a streak', () => {
      const { resultado, estado } = fecharSemana(comEstado({ streakSemanas: 2 }), {
        semanaInicio: S1,
        meta: 3,
        treinos: 3,
      });

      expect(resultado.status).toBe(WeekStatus.CUMPRIDA);
      expect(resultado.streakAntes).toBe(2);
      expect(resultado.streakDepois).toBe(3);
      expect(estado.streakSemanas).toBe(3);
    });

    it('treinar acima da meta nao vale streak dobrada', () => {
      const { estado } = fecharSemana(comEstado({ streakSemanas: 1 }), {
        semanaInicio: S1,
        meta: 3,
        treinos: 6,
      });

      expect(estado.streakSemanas).toBe(2);
    });

    it('nao gasta congelamento', () => {
      const { resultado } = fecharSemana(comEstado({ tokens: 1 }), {
        semanaInicio: S1,
        meta: 3,
        treinos: 4,
      });

      expect(resultado.congelamentoUsado).toBe(false);
      expect(resultado.tokensDepois).toBe(1);
    });
  });

  describe('congelamento', () => {
    it('nao cumpriu, mas tinha token: nao avanca e nao zera', () => {
      const { resultado, estado } = fecharSemana(
        comEstado({ streakSemanas: 5, tokens: 2 }),
        { semanaInicio: S1, meta: 3, treinos: 1 },
      );

      expect(resultado.status).toBe(WeekStatus.CONGELADA);
      expect(resultado.congelamentoUsado).toBe(true);
      expect(resultado.streakDepois).toBe(5);
      expect(estado.streakSemanas).toBe(5);
      expect(estado.tokens).toBe(1);
    });

    it('sem token, perde', () => {
      const { resultado, estado } = fecharSemana(
        comEstado({ streakSemanas: 5, tokens: 0 }),
        { semanaInicio: S1, meta: 3, treinos: 2 },
      );

      expect(resultado.status).toBe(WeekStatus.PERDIDA);
      expect(estado.streakSemanas).toBe(0);
    });

    // Queimar um congelamento para proteger uma sequencia de zero gastaria em
    // silencio o recurso de quem esta voltando -- justo quem mais precisa dele.
    it('nao gasta token quando nao ha streak para proteger', () => {
      const { resultado, estado } = fecharSemana(
        comEstado({ streakSemanas: 0, tokens: 2 }),
        { semanaInicio: S1, meta: 3, treinos: 0 },
      );

      expect(resultado.status).toBe(WeekStatus.PERDIDA);
      expect(resultado.congelamentoUsado).toBe(false);
      expect(estado.tokens).toBe(2);
    });

    it('ganha +1 token a cada 4 semanas cumpridas seguidas', () => {
      const semanas = [S1, S2, S3, S4].map((semanaInicio) => ({
        semanaInicio,
        meta: 3,
        treinos: 3,
      }));

      const { estado, resultados } = rodar(comEstado({ tokens: 0 }), semanas);

      expect(resultados.map((r) => r.tokensDepois)).toEqual([0, 0, 0, 1]);
      expect(estado.tokens).toBe(1);
      expect(estado.streakSemanas).toBe(4);
    });

    it('o ganho respeita o teto de 2', () => {
      const semanas = [S1, S2, S3, S4].map((semanaInicio) => ({
        semanaInicio,
        meta: 3,
        treinos: 3,
      }));

      const { estado } = rodar(comEstado({ tokens: TOKENS_MAX }), semanas);

      expect(estado.tokens).toBe(TOKENS_MAX);
    });

    it('uma semana congelada quebra a corrida que gera token novo', () => {
      const { estado } = rodar(comEstado({ streakSemanas: 1, tokens: 1 }), [
        { semanaInicio: S1, meta: 3, treinos: 3 }, // cumpridasSeguidas 1
        { semanaInicio: S2, meta: 3, treinos: 0 }, // congela -> zera a corrida
        { semanaInicio: S3, meta: 3, treinos: 3 }, // cumpridasSeguidas 1
        { semanaInicio: S4, meta: 3, treinos: 3 }, // cumpridasSeguidas 2
      ]);

      expect(estado.cumpridasSeguidas).toBe(2);
      // Gastou 1 congelamento e nao chegou a 4 seguidas para repor.
      expect(estado.tokens).toBe(0);
    });
  });

  describe('reparo', () => {
    it('meta + 1 depois de uma semana perdida devolve a sequencia', () => {
      const { estado, resultados } = rodar(comEstado({ streakSemanas: 6, tokens: 0 }), [
        { semanaInicio: S1, meta: 3, treinos: 1 }, // PERDIDA, guarda 6
        { semanaInicio: S2, meta: 3, treinos: 4 }, // meta + 1 -> repara
      ]);

      expect(resultados[0].status).toBe(WeekStatus.PERDIDA);
      expect(resultados[0].streakSalva).toBe(6);
      expect(resultados[1].reparo).toBe(true);
      expect(resultados[1].streakDepois).toBe(7);
      expect(estado.streakSemanas).toBe(7);
    });

    it('bater a meta exata nao repara: recomeca do 1', () => {
      const { estado, resultados } = rodar(comEstado({ streakSemanas: 6, tokens: 0 }), [
        { semanaInicio: S1, meta: 3, treinos: 0 },
        { semanaInicio: S2, meta: 3, treinos: 3 },
      ]);

      expect(resultados[1].reparo).toBe(false);
      expect(estado.streakSemanas).toBe(1);
    });

    it('a janela vale so para a semana imediatamente seguinte', () => {
      const { estado, resultados } = rodar(comEstado({ streakSemanas: 6, tokens: 0 }), [
        { semanaInicio: S1, meta: 3, treinos: 0 }, // PERDIDA, guarda 6
        { semanaInicio: S2, meta: 3, treinos: 0 }, // PERDIDA de novo (streak ja 0)
        { semanaInicio: S3, meta: 3, treinos: 5 }, // tarde demais
      ]);

      expect(resultados[1].streakSalva).toBeNull();
      expect(resultados[2].reparo).toBe(false);
      expect(estado.streakSemanas).toBe(1);
    });

    it('um reparo por trimestre', () => {
      const { estado, resultados } = rodar(comEstado({ streakSemanas: 4, tokens: 0 }), [
        { semanaInicio: '2026-07-06', meta: 3, treinos: 0 }, // PERDIDA (guarda 4)
        { semanaInicio: '2026-07-13', meta: 3, treinos: 4 }, // repara -> 5
        { semanaInicio: '2026-07-20', meta: 3, treinos: 0 }, // PERDIDA (guarda 5)
        { semanaInicio: '2026-07-27', meta: 3, treinos: 4 }, // mesmo trimestre: nao repara
      ]);

      expect(resultados[1].reparo).toBe(true);
      expect(resultados[3].reparo).toBe(false);
      expect(estado.streakSemanas).toBe(1);
    });

    it('o trimestre seguinte libera um reparo novo', () => {
      const { resultados } = rodar(
        comEstado({ streakSemanas: 4, tokens: 0, ultimoReparoEm: '2026-07-13' }),
        [
          { semanaInicio: '2026-09-28', meta: 3, treinos: 0 }, // PERDIDA (T3)
          { semanaInicio: '2026-10-05', meta: 3, treinos: 4 }, // T4: repara
        ],
      );

      expect(resultados[1].reparo).toBe(true);
      expect(resultados[1].streakDepois).toBe(5);
    });
  });

  describe('ausencia longa', () => {
    // Quatro semanas sem nada: os dois congelamentos seguram duas, as outras
    // duas zeram. E o comportamento que a regra de recomeco descreve, sem
    // precisar de um caso especial.
    it('quatro semanas vazias consomem os congelamentos e zeram a streak', () => {
      const semanas = [S1, S2, S3, S4].map((semanaInicio) => ({
        semanaInicio,
        meta: 3,
        treinos: 0,
      }));

      const { estado, resultados } = rodar(
        comEstado({ streakSemanas: 3, tokens: 2 }),
        semanas,
      );

      expect(resultados.map((r) => r.status)).toEqual([
        WeekStatus.CONGELADA,
        WeekStatus.CONGELADA,
        WeekStatus.PERDIDA,
        WeekStatus.PERDIDA,
      ]);
      expect(estado.streakSemanas).toBe(0);
      expect(estado.tokens).toBe(0);
    });
  });

  describe('determinismo', () => {
    // E o que torna o fechamento preguicoso seguro: refazer o calculo da mesma
    // semana com o mesmo estado nao pode dar outro resultado.
    it('repetir o mesmo fechamento da o mesmo resultado', () => {
      const entrada = { semanaInicio: S1, meta: 3, treinos: 3 };
      const estado = comEstado({ streakSemanas: 2, tokens: 1 });

      expect(fecharSemana(estado, entrada)).toEqual(fecharSemana(estado, entrada));
    });

    it('nao muda o estado recebido', () => {
      const estado = comEstado({ streakSemanas: 2, tokens: 1 });
      const copia = { ...estado };

      fecharSemana(estado, { semanaInicio: S1, meta: 3, treinos: 0 });

      expect(estado).toEqual(copia);
    });
  });
});
