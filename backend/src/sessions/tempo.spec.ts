import {
  chaveDoDia,
  diaDaSemana,
  inicioDaSemana,
  minutosEntre,
  semanaDe,
  semanasEntre,
  somarDias,
} from './tempo';

const SP = 'America/Sao_Paulo';

describe('tempo (dia e semana no fuso do usuario)', () => {
  describe('chaveDoDia', () => {
    it('usa o fuso do usuario, nao UTC', () => {
      // 26/08/2026 01:00 UTC = 25/08/2026 22:00 em Sao Paulo (UTC-3).
      const instante = new Date('2026-08-26T01:00:00Z');

      expect(chaveDoDia(instante, 'UTC')).toBe('2026-08-26');
      expect(chaveDoDia(instante, SP)).toBe('2026-08-25');
    });

    it('quem treina 22h nao tem o treino jogado pro dia seguinte', () => {
      // Era o bug de contar no fuso do dispositivo/UTC.
      const treinoDaNoite = new Date('2026-08-26T01:30:00Z'); // 22:30 em SP

      expect(chaveDoDia(treinoDaNoite, SP)).toBe('2026-08-25');
    });

    it('formata sempre com dois digitos', () => {
      expect(chaveDoDia(new Date('2026-01-05T15:00:00Z'), SP)).toBe('2026-01-05');
    });
  });

  describe('somarDias', () => {
    it('anda para tras e para frente', () => {
      expect(somarDias('2026-08-26', -1)).toBe('2026-08-25');
      expect(somarDias('2026-08-26', 1)).toBe('2026-08-27');
    });

    it('atravessa virada de mes e de ano', () => {
      expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
      expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('acerta ano bissexto', () => {
      expect(somarDias('2028-03-01', -1)).toBe('2028-02-29');
    });
  });

  describe('diaDaSemana', () => {
    it('0 = domingo, 1 = segunda', () => {
      // 2026-08-24 e uma segunda-feira.
      expect(diaDaSemana(new Date('2026-08-24T15:00:00Z'), SP)).toBe(1);
      expect(diaDaSemana(new Date('2026-08-23T15:00:00Z'), SP)).toBe(0);
    });
  });

  describe('semanaDe', () => {
    it('a semana comeca na segunda e termina no domingo', () => {
      // Quarta, 26/08/2026.
      const semana = semanaDe(new Date('2026-08-26T15:00:00Z'), SP);

      expect(semana).toEqual({ inicio: '2026-08-24', fim: '2026-08-30' });
    });

    it('no domingo a semana ainda e a que comecou na segunda anterior', () => {
      // Domingo 30/08 fecha a semana que comecou em 24/08 (ISO), e nao abre uma nova.
      const semana = semanaDe(new Date('2026-08-30T15:00:00Z'), SP);

      expect(semana).toEqual({ inicio: '2026-08-24', fim: '2026-08-30' });
    });

    it('na segunda, a semana comeca no proprio dia', () => {
      const semana = semanaDe(new Date('2026-08-24T15:00:00Z'), SP);

      expect(semana.inicio).toBe('2026-08-24');
    });

    it('respeita o fuso na virada do dia', () => {
      // 31/08 00:30 UTC = 30/08 21:30 em SP: em UTC ja e a semana nova,
      // em Sao Paulo ainda e a semana antiga.
      const instante = new Date('2026-08-31T00:30:00Z');

      expect(semanaDe(instante, 'UTC').inicio).toBe('2026-08-31');
      expect(semanaDe(instante, SP).inicio).toBe('2026-08-24');
    });
  });

  describe('inicioDaSemana', () => {
    it('leva qualquer dia para a segunda da sua semana', () => {
      // 2026-08-24 e uma segunda-feira.
      expect(inicioDaSemana('2026-08-24')).toBe('2026-08-24');
      expect(inicioDaSemana('2026-08-27')).toBe('2026-08-24');
      // Domingo pertence a semana que comecou na segunda anterior, nao a proxima.
      expect(inicioDaSemana('2026-08-30')).toBe('2026-08-24');
      expect(inicioDaSemana('2026-08-31')).toBe('2026-08-31');
    });

    it('atravessa a virada de mes e de ano', () => {
      expect(inicioDaSemana('2026-01-01')).toBe('2025-12-29');
    });

    it('concorda com semanaDe, que trabalha com instante e fuso', () => {
      const instante = new Date('2026-08-27T15:00:00Z');

      expect(inicioDaSemana(chaveDoDia(instante, SP))).toBe(semanaDe(instante, SP).inicio);
    });
  });

  describe('semanasEntre', () => {
    it('conta semanas inteiras entre duas segundas', () => {
      expect(semanasEntre('2026-08-24', '2026-08-24')).toBe(0);
      expect(semanasEntre('2026-08-24', '2026-08-31')).toBe(1);
      expect(semanasEntre('2026-08-03', '2026-08-24')).toBe(3);
    });

    it('nao se perde no horario de verao (as chaves sao dias civis)', () => {
      // Sao Paulo nao tem mais DST, mas a conta e feita em UTC de proposito
      // para nao depender disso.
      expect(semanasEntre('2026-01-05', '2026-12-28')).toBe(51);
    });

    it('e negativo quando anda para tras', () => {
      expect(semanasEntre('2026-08-31', '2026-08-24')).toBe(-1);
    });
  });

  describe('minutosEntre', () => {
    it('conta minutos cheios, descartando os segundos', () => {
      const a = new Date('2026-08-26T10:00:00Z');
      expect(minutosEntre(a, new Date('2026-08-26T10:59:59Z'))).toBe(59);
      expect(minutosEntre(a, new Date('2026-08-26T11:00:00Z'))).toBe(60);
    });

    it('treino de 1 segundo da 0 minuto', () => {
      const a = new Date('2026-08-26T10:00:00Z');
      expect(minutosEntre(a, new Date('2026-08-26T10:00:01Z'))).toBe(0);
    });
  });
});
