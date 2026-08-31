import {
  estatisticasDosDias,
  EstatisticasDoUsuario,
  freshStart,
  MARCOS,
  marcosAlcancados,
  proximoMarco,
  RECORDES,
  recordesAtuais,
} from './conquistas';

function stats(over: Partial<EstatisticasDoUsuario> = {}): EstatisticasDoUsuario {
  return {
    totalDias: 0,
    totalMinutos: 0,
    semanasCumpridas: 0,
    melhorStreakSemanas: 0,
    melhorStreakDias: 0,
    melhorSemana: 0,
    reparou: false,
    recomecou: false,
    ...over,
  };
}

const codigos = (lista: { code: string }[]) => lista.map((c) => c.code);

describe('catalogo', () => {
  it('nao tem codigo repetido', () => {
    const todos = [...MARCOS.map((m) => m.code), ...RECORDES.map((r) => r.code)];

    expect(new Set(todos).size).toBe(todos.length);
  });

  it('esta em ordem de dificuldade, para a escada nunca andar para tras', () => {
    // Comparavel so dentro de cada eixo; aqui checamos os tres que sao escada.
    const alvoDe = (code: string) => MARCOS.find((m) => m.code === code)!.alvo;

    expect(alvoDe('DIAS_10')).toBeLessThan(alvoDe('DIAS_25'));
    expect(alvoDe('DIAS_25')).toBeLessThan(alvoDe('DIAS_50'));
    expect(alvoDe('SEMANAS_4')).toBeLessThan(alvoDe('SEMANAS_6'));
    expect(alvoDe('SEMANAS_26')).toBeLessThan(alvoDe('SEMANAS_52'));
  });

  // Restricao permanente: um catalogo que so premia a sequencia perfeita diz a
  // quem falhou que nao ha mais nada a ganhar.
  it('premia voltar, e nao so nunca ter parado', () => {
    expect(codigos(MARCOS)).toContain('REPAROU');
    expect(codigos(MARCOS)).toContain('RECOMECOU');
  });

  it('nenhum marco depende de dado corporal ou clinico', () => {
    const texto = MARCOS.map((m) => `${m.nome} ${m.descricao}`).join(' ').toLowerCase();

    for (const proibido of ['peso', 'kg', 'medida', 'gordura', 'massa', 'imc']) {
      expect(texto).not.toContain(proibido);
    }
  });
});

describe('marcosAlcancados', () => {
  it('quem nao treinou nada nao conquistou nada', () => {
    expect(marcosAlcancados(stats())).toEqual([]);
  });

  it('o primeiro treino ja vale um marco', () => {
    expect(codigos(marcosAlcancados(stats({ totalDias: 1 })))).toEqual([
      'PRIMEIRO_TREINO',
    ]);
  });

  it('acumula os marcos do mesmo eixo', () => {
    const alcancados = codigos(marcosAlcancados(stats({ totalDias: 30 })));

    expect(alcancados).toContain('DIAS_10');
    expect(alcancados).toContain('DIAS_25');
    expect(alcancados).not.toContain('DIAS_50');
  });

  it('reparar e recomecar sao marcos por si', () => {
    expect(codigos(marcosAlcancados(stats({ reparou: true })))).toContain('REPAROU');
    expect(codigos(marcosAlcancados(stats({ recomecou: true })))).toContain('RECOMECOU');
  });

  it('24 horas somadas contam em minutos', () => {
    expect(codigos(marcosAlcancados(stats({ totalMinutos: 1439 })))).not.toContain(
      'HORAS_24',
    );
    expect(codigos(marcosAlcancados(stats({ totalMinutos: 1440 })))).toContain('HORAS_24');
  });
});

describe('recordesAtuais', () => {
  it('recorde em zero nao existe', () => {
    expect(recordesAtuais(stats())).toEqual([]);
  });

  it('devolve o valor de cada recorde', () => {
    const atuais = recordesAtuais(
      stats({ melhorStreakSemanas: 3, melhorStreakDias: 5, melhorSemana: 4 }),
    );

    expect(atuais).toEqual([
      { code: 'RECORDE_SEMANAS', kind: 'RECORDE', value: 3 },
      { code: 'RECORDE_DIAS', kind: 'RECORDE', value: 5 },
      { code: 'RECORDE_SEMANA_CHEIA', kind: 'RECORDE', value: 4 },
    ]);
  });
});

describe('proximoMarco', () => {
  it('aponta o primeiro ainda nao conquistado, com o progresso', () => {
    const proximo = proximoMarco(stats({ totalDias: 6 }), new Set(['PRIMEIRO_TREINO']));

    expect(proximo).toMatchObject({ code: 'PRIMEIRA_SEMANA', alvo: 1 });
  });

  it('nunca mostra progresso acima do alvo', () => {
    const proximo = proximoMarco(stats({ totalDias: 999 }), new Set(['PRIMEIRO_TREINO']));

    expect(proximo!.progresso).toBeLessThanOrEqual(proximo!.alvo);
  });

  it('quem pegou tudo nao recebe um marco impossivel de consolacao', () => {
    const todos = new Set(MARCOS.map((m) => m.code));

    expect(proximoMarco(stats(), todos)).toBeNull();
  });
});

describe('estatisticasDosDias', () => {
  const dia = (d: string, minutos = 60) => ({ dia: d, minutos });

  it('conta dias e soma minutos', () => {
    const e = estatisticasDosDias([dia('2026-08-24', 50), dia('2026-08-26', 70)]);

    expect(e.totalDias).toBe(2);
    expect(e.totalMinutos).toBe(120);
  });

  it('acha a maior sequencia de dias seguidos', () => {
    const e = estatisticasDosDias([
      dia('2026-08-03'),
      dia('2026-08-10'),
      dia('2026-08-11'),
      dia('2026-08-12'),
      dia('2026-08-20'),
    ]);

    expect(e.melhorStreakDias).toBe(3);
  });

  it('acha a semana mais cheia', () => {
    const e = estatisticasDosDias([
      dia('2026-08-24'),
      dia('2026-08-25'),
      dia('2026-08-26'),
      dia('2026-08-27'),
      dia('2026-08-31'),
    ]);

    expect(e.melhorSemana).toBe(4);
  });

  describe('recomeco', () => {
    it('so conta quando a pessoa sumiu E VOLTOU', () => {
      // Treinou em julho, sumiu cinco semanas, voltou.
      const e = estatisticasDosDias([dia('2026-07-06'), dia('2026-08-17')]);

      expect(e.recomecou).toBe(true);
    });

    it('sumico que ainda dura nao conta', () => {
      const e = estatisticasDosDias([dia('2026-07-06')]);

      expect(e.recomecou).toBe(false);
    });

    it('folga curta nao e recomeco', () => {
      const e = estatisticasDosDias([dia('2026-08-03'), dia('2026-08-24')]);

      expect(e.recomecou).toBe(false);
    });
  });

  it('nao quebra com lista vazia', () => {
    expect(estatisticasDosDias([])).toEqual({
      totalDias: 0,
      totalMinutos: 0,
      melhorStreakDias: 0,
      melhorSemana: 0,
      recomecou: false,
    });
  });
});

describe('freshStart', () => {
  it('1o de janeiro e virada de ano', () => {
    expect(freshStart('2027-01-01')).toBe('ANO');
  });

  it('1o dos outros meses e virada de mes', () => {
    expect(freshStart('2026-09-01')).toBe('MES');
    expect(freshStart('2026-12-01')).toBe('MES');
  });

  it('qualquer outro dia nao e marco temporal', () => {
    expect(freshStart('2026-08-31')).toBeNull();
    expect(freshStart('2026-09-02')).toBeNull();
    expect(freshStart('2026-09-15')).toBeNull();
  });
});
