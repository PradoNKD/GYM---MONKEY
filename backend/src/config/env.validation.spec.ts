import { validateEnv } from './env.validation';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'file:./dev.db',
  PORT: '3000',
  FRONTEND_URL: 'http://localhost:5173',
};

describe('validateEnv', () => {
  it('aceita uma configuracao valida e retorna os valores tipados', () => {
    const resultado = validateEnv(base);

    expect(resultado.JWT_SECRET).toBe(base.JWT_SECRET);
    expect(resultado.DATABASE_URL).toBe('file:./dev.db');
    expect(resultado.PORT).toBe(3000);
    expect(resultado.FRONTEND_URL).toBe('http://localhost:5173');
  });

  describe('JWT_SECRET', () => {
    it('rejeita quando esta ausente (o caso critico: bypass de auth)', () => {
      const { JWT_SECRET, ...semSecret } = base;
      void JWT_SECRET;
      expect(() => validateEnv(semSecret)).toThrow(/JWT_SECRET e obrigatorio/);
    });

    it('rejeita quando e vazio', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: '' })).toThrow(
        /JWT_SECRET e obrigatorio/,
      );
    });

    it('rejeita quando tem menos de 32 caracteres', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'x'.repeat(31) })).toThrow(
        /no minimo 32 caracteres/,
      );
    });

    it('aceita exatamente 32 caracteres (limite)', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'x'.repeat(32) })).not.toThrow();
    });

    it('rejeita o placeholder do .env.example', () => {
      expect(() =>
        validateEnv({ ...base, JWT_SECRET: 'troque-este-valor-por-um-segredo-forte' }),
      ).toThrow(/placeholder/);
    });

    it('rejeita o placeholder independente de maiuscula/minuscula', () => {
      // Mesmo placeholder do .env.example (38 chars, passa no tamanho), mas
      // em caixa alta: a comparacao e case-insensitive, entao ainda cai.
      expect(() =>
        validateEnv({ ...base, JWT_SECRET: 'TROQUE-ESTE-VALOR-POR-UM-SEGREDO-FORTE' }),
      ).toThrow(/placeholder/);
    });
  });

  describe('DATABASE_URL', () => {
    it('rejeita quando esta ausente', () => {
      const { DATABASE_URL, ...semDb } = base;
      void DATABASE_URL;
      expect(() => validateEnv(semDb)).toThrow(/DATABASE_URL e obrigatorio/);
    });
  });

  describe('PORT', () => {
    it('assume 3000 quando nao informado', () => {
      const { PORT, ...semPort } = base;
      void PORT;
      expect(validateEnv(semPort).PORT).toBe(3000);
    });

    it('rejeita valor nao numerico', () => {
      expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT invalido/);
    });

    it('rejeita porta fora da faixa', () => {
      expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT invalido/);
    });
  });

  describe('FRONTEND_URL', () => {
    it('e opcional (fica undefined quando ausente)', () => {
      const { FRONTEND_URL, ...semFront } = base;
      void FRONTEND_URL;
      expect(validateEnv(semFront).FRONTEND_URL).toBeUndefined();
    });
  });

  it('acumula varios erros numa mensagem so', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET[\s\S]*DATABASE_URL/);
  });
});
