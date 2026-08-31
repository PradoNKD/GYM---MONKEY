import { janelaDoMapa, MAX_SEMANAS_MAPA } from './mapa';

// 2026-08-31 e uma segunda-feira.
const HOJE = '2026-08-31';

describe('janelaDoMapa', () => {
  it('comeca na segunda da semana do primeiro treino', () => {
    // 2026-08-05 e uma quarta; a semana dela comecou em 03/08.
    expect(janelaDoMapa('2026-08-05', HOJE)).toEqual({
      inicio: '2026-08-03',
      fim: HOJE,
    });
  });

  // A regra que impede a grade de virar vergonha: quem comecou faz um mes nao
  // precisa olhar para meses em que nao existia por aqui.
  it('nao mostra vazio antes do primeiro treino da pessoa', () => {
    const { inicio } = janelaDoMapa('2026-08-24', HOJE);

    expect(inicio).toBe('2026-08-24');
  });

  it('quem nunca treinou ve so a semana corrente, nao um ano de vazio', () => {
    expect(janelaDoMapa(null, HOJE)).toEqual({ inicio: HOJE, fim: HOJE });
  });

  it('respeita o teto de semanas para quem treina ha anos', () => {
    const { inicio } = janelaDoMapa('2019-01-07', HOJE);

    // 51 semanas para tras a partir da semana corrente.
    expect(inicio).toBe('2025-09-08');
  });

  it('o teto e configuravel', () => {
    expect(janelaDoMapa('2019-01-07', HOJE, 4).inicio).toBe('2026-08-10');
  });

  it('a janela nunca passa de MAX_SEMANAS_MAPA semanas', () => {
    const { inicio, fim } = janelaDoMapa('2010-01-04', HOJE);
    const dias =
      (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000;

    expect(dias / 7).toBeLessThanOrEqual(MAX_SEMANAS_MAPA);
  });

  // Dia que ainda nao aconteceu nao e "dia sem treino".
  it('termina hoje, e nao no domingo da semana corrente', () => {
    // 2026-08-26 e uma quarta.
    expect(janelaDoMapa('2026-08-03', '2026-08-26').fim).toBe('2026-08-26');
  });

  it('o inicio e sempre uma segunda, para as colunas fecharem', () => {
    for (const primeiro of ['2026-08-04', '2026-08-08', '2026-08-09']) {
      const { inicio } = janelaDoMapa(primeiro, HOJE);
      const dow = new Date(`${inicio}T00:00:00Z`).getUTCDay();

      expect(dow).toBe(1);
    }
  });
});
