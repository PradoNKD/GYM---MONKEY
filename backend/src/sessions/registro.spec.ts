import { WorkoutType } from '@prisma/client';
import {
  esforcoValido,
  MAX_TIPOS,
  normalizarNota,
  normalizarRegistro,
  normalizarTipos,
  NOTA_MAX,
  temRegistro,
} from './registro';

describe('normalizarTipos', () => {
  it('tira repetidos mantendo a ordem de escolha', () => {
    expect(
      normalizarTipos([WorkoutType.PEITO, WorkoutType.BRACOS, WorkoutType.PEITO]),
    ).toEqual([WorkoutType.PEITO, WorkoutType.BRACOS]);
  });

  it('corta no maximo', () => {
    const muitos = [
      WorkoutType.PEITO,
      WorkoutType.COSTAS,
      WorkoutType.PERNAS,
      WorkoutType.OMBROS,
      WorkoutType.BRACOS,
    ];

    expect(normalizarTipos(muitos)).toHaveLength(MAX_TIPOS);
    expect(normalizarTipos(muitos)).toEqual(muitos.slice(0, MAX_TIPOS));
  });

  it('aceita lista vazia', () => {
    expect(normalizarTipos([])).toEqual([]);
  });
});

describe('normalizarNota', () => {
  it('tira espaco das pontas', () => {
    expect(normalizarNota('  supino 4x10  ')).toBe('supino 4x10');
  });

  // Nota "vazia" seria indistinguivel de nota preenchida na hora de medir
  // adesao a Fase A.
  it('espaco em branco vira nulo, nao nota vazia', () => {
    expect(normalizarNota('')).toBeNull();
    expect(normalizarNota('   ')).toBeNull();
    expect(normalizarNota('\n\t ')).toBeNull();
  });

  it('corta no tamanho maximo', () => {
    expect(normalizarNota('a'.repeat(NOTA_MAX + 50))).toHaveLength(NOTA_MAX);
  });

  it('preserva acento e quebra de linha do meio', () => {
    expect(normalizarNota('supino\nagachamento')).toBe('supino\nagachamento');
  });
});

describe('esforcoValido', () => {
  it('aceita de 1 a 5', () => {
    expect(esforcoValido(1)).toBe(true);
    expect(esforcoValido(5)).toBe(true);
  });

  it('recusa fora da faixa e nao-inteiro', () => {
    expect(esforcoValido(0)).toBe(false);
    expect(esforcoValido(6)).toBe(false);
    expect(esforcoValido(3.5)).toBe(false);
  });
});

describe('normalizarRegistro', () => {
  // A distincao que evita o pior bug possivel aqui: salvar so o esforco nao
  // pode apagar a nota que a pessoa escreveu.
  it('campo ausente nao entra no update', () => {
    expect(normalizarRegistro({ effort: 4 })).toEqual({ effort: 4 });
    expect(normalizarRegistro({ effort: 4 })).not.toHaveProperty('note');
    expect(normalizarRegistro({ effort: 4 })).not.toHaveProperty('workoutTypes');
  });

  it('campo nulo limpa', () => {
    expect(normalizarRegistro({ note: null, effort: null })).toEqual({
      note: null,
      effort: null,
    });
  });

  it('tipos nulos viram lista vazia, que e como se limpa uma lista', () => {
    expect(normalizarRegistro({ workoutTypes: null })).toEqual({ workoutTypes: [] });
  });

  it('corpo vazio nao gera update nenhum', () => {
    expect(normalizarRegistro({})).toEqual({});
  });

  it('normaliza tudo junto', () => {
    expect(
      normalizarRegistro({
        workoutTypes: [WorkoutType.PEITO, WorkoutType.PEITO],
        effort: 3,
        note: '  supino 4x10  ',
      }),
    ).toEqual({
      workoutTypes: [WorkoutType.PEITO],
      effort: 3,
      note: 'supino 4x10',
    });
  });
});

describe('temRegistro', () => {
  const vazio = { workoutTypes: [], effort: null, note: null };

  it('sessao sem nada preenchido nao conta como registrada', () => {
    expect(temRegistro(vazio)).toBe(false);
  });

  it('qualquer um dos tres ja conta', () => {
    expect(temRegistro({ ...vazio, workoutTypes: [WorkoutType.CARDIO] })).toBe(true);
    expect(temRegistro({ ...vazio, effort: 2 })).toBe(true);
    expect(temRegistro({ ...vazio, note: 'corrida' })).toBe(true);
  });
});
