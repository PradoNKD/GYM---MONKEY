import {
  cargaMaxima,
  formatarPeso,
  gramasParaKg,
  kgParaGramas,
  limparNome,
  NOME_MAX,
  normalizar,
  progressao,
  recorde,
  volume,
} from './exercicios';

describe('normalizar', () => {
  // E esta funcao que decide se duas linhas sao o mesmo exercicio. Se ela
  // errar, o grafico se parte em varias linhas com o mesmo nome.
  it.each([
    ['Supino reto', 'supino reto'],
    ['SUPINO RETO', 'supino reto'],
    ['  supino   reto  ', 'supino reto'],
    ['Tríceps testa', 'triceps testa'],
    ['TRÍCEPS TESTA', 'triceps testa'],
    ['Rosca dirêta', 'rosca direta'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it('nomes diferentes continuam diferentes', () => {
    expect(normalizar('Supino reto')).not.toBe(normalizar('Supino inclinado'));
  });
});

describe('limparNome', () => {
  it('tira espaco sobrando e mantem a caixa que a pessoa escreveu', () => {
    expect(limparNome('  Supino   reto ')).toBe('Supino reto');
  });

  it('corta no limite', () => {
    expect(limparNome('a'.repeat(200))).toHaveLength(NOME_MAX);
  });

  it('nome so de espaco nao e nome', () => {
    expect(limparNome('   ')).toBeNull();
    expect(limparNome('')).toBeNull();
  });
});

describe('peso em gramas', () => {
  // Inteiro em gramas existe para a carga nunca virar 42.49999999.
  it('ida e volta nao perde precisao em carga fracionada', () => {
    for (const kg of [40, 42.5, 1.25, 7.75, 100.25]) {
      expect(gramasParaKg(kgParaGramas(kg))).toBe(kg);
    }
  });

  it('soma de fracoes fecha exata', () => {
    const tres = kgParaGramas(1.25) + kgParaGramas(1.25) + kgParaGramas(1.25);

    expect(gramasParaKg(tres)).toBe(3.75);
  });

  it.each([
    [40000, '40 kg'],
    [42500, '42,5 kg'],
    [1250, '1,25 kg'],
    [null, 'peso do corpo'],
  ])('formata %s como %s', (g, esperado) => {
    expect(formatarPeso(g as number | null)).toBe(esperado);
  });
});

describe('volume', () => {
  it('soma reps x carga', () => {
    // 4x10 com 40kg
    const series = Array.from({ length: 4 }, () => ({ reps: 10, pesoG: 40000 }));

    expect(volume(series)).toBe(1_600_000);
  });

  // Inventar um peso para o corpo seria mentira maior que somar zero.
  it('serie com peso do corpo nao entra no volume', () => {
    expect(volume([{ reps: 10, pesoG: null }])).toBe(0);
    expect(volume([{ reps: 10, pesoG: 40000 }, { reps: 10, pesoG: null }])).toBe(400_000);
  });

  it('lista vazia da zero', () => {
    expect(volume([])).toBe(0);
  });
});

describe('cargaMaxima', () => {
  it('acha a maior carga', () => {
    expect(
      cargaMaxima([
        { reps: 10, pesoG: 40000 },
        { reps: 8, pesoG: 45000 },
        { reps: 6, pesoG: 42500 },
      ]),
    ).toBe(45000);
  });

  it('exercicio so com peso do corpo nao tem carga maxima', () => {
    expect(cargaMaxima([{ reps: 12, pesoG: null }])).toBeNull();
  });
});

describe('progressao', () => {
  const s = (dia: string, reps: number, pesoG: number | null) => ({ dia, reps, pesoG });

  it('agrupa por dia, em ordem, com carga maxima e volume', () => {
    const pontos = progressao([
      s('2026-09-10', 10, 40000),
      s('2026-09-10', 10, 40000),
      s('2026-09-03', 10, 37500),
    ]);

    expect(pontos).toEqual([
      { dia: '2026-09-03', cargaMaxG: 37500, volumeG: 375_000, series: 1 },
      { dia: '2026-09-10', cargaMaxG: 40000, volumeG: 800_000, series: 2 },
    ]);
  });

  // Duas sessoes no mesmo dia sao o mesmo treino partido em dois.
  it('duas sessoes no mesmo dia viram um ponto so', () => {
    const pontos = progressao([s('2026-09-10', 10, 40000), s('2026-09-10', 8, 45000)]);

    expect(pontos).toHaveLength(1);
    expect(pontos[0]).toMatchObject({ cargaMaxG: 45000, series: 2 });
  });

  it('sem serie nenhuma nao ha grafico', () => {
    expect(progressao([])).toEqual([]);
  });
});

describe('recorde', () => {
  const p = (dia: string, cargaMaxG: number | null) => ({
    dia,
    cargaMaxG,
    volumeG: 0,
    series: 1,
  });

  it('e a maior carga, com o dia em que aconteceu', () => {
    expect(recorde([p('2026-09-03', 40000), p('2026-09-10', 45000), p('2026-09-17', 42500)]))
      .toEqual({ dia: '2026-09-10', pesoG: 45000 });
  });

  // Mesma regra dos recordes das conquistas: so a superacao conta.
  it('repetir a carga nao bate o recorde -- ele fica com a data mais antiga', () => {
    expect(recorde([p('2026-09-03', 40000), p('2026-09-10', 40000)])).toEqual({
      dia: '2026-09-03',
      pesoG: 40000,
    });
  });

  it('quem so treinou com o peso do corpo nao tem recorde de carga', () => {
    expect(recorde([p('2026-09-03', null)])).toBeNull();
  });

  it('sem pontos, sem recorde', () => {
    expect(recorde([])).toBeNull();
  });
});
