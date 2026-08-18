import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calcularResumoSemanal,
  calcularSessoesCompletas,
  calcularStreak,
  duracaoEmMinutos,
  formatarMinutos,
  isoParaDatetimeLocal,
  ordenarPorHorarioDesc,
  type Sessao,
} from "./calculos";
import type { Registro, TipoRegistro } from "./types";

/**
 * Helper que monta um registro a partir de uma data local, para os testes
 * nao dependerem do fuso da maquina que roda a suite.
 */
function registro(id: string, type: TipoRegistro, data: Date): Registro {
  return { id, type, timestamp: data.toISOString(), userId: "user-1" };
}

function emDiasAtras(dias: number, hora = 10, minuto = 0): Date {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  data.setHours(hora, minuto, 0, 0);
  return data;
}

describe("formatarMinutos", () => {
  it("mostra so minutos quando menos de 1 hora", () => {
    expect(formatarMinutos(0)).toBe("0min");
    expect(formatarMinutos(45)).toBe("45min");
    expect(formatarMinutos(59)).toBe("59min");
  });

  it("mostra horas e minutos a partir de 60 minutos", () => {
    expect(formatarMinutos(60)).toBe("1h 0min");
    expect(formatarMinutos(90)).toBe("1h 30min");
    expect(formatarMinutos(125)).toBe("2h 5min");
  });

  it("lida com duracoes longas", () => {
    expect(formatarMinutos(1440)).toBe("24h 0min");
  });
});

describe("duracaoEmMinutos", () => {
  it("calcula a diferenca em minutos entre dois horarios", () => {
    expect(
      duracaoEmMinutos("2026-08-18T10:00:00.000Z", "2026-08-18T11:30:00.000Z"),
    ).toBe(90);
  });

  it("arredonda para o minuto mais proximo", () => {
    // 40 segundos arredonda para 1 minuto
    expect(
      duracaoEmMinutos("2026-08-18T10:00:00.000Z", "2026-08-18T10:00:40.000Z"),
    ).toBe(1);
    // 20 segundos arredonda para 0
    expect(
      duracaoEmMinutos("2026-08-18T10:00:00.000Z", "2026-08-18T10:00:20.000Z"),
    ).toBe(0);
  });

  it("nunca retorna negativo, mesmo se o fim for antes do inicio", () => {
    expect(
      duracaoEmMinutos("2026-08-18T11:00:00.000Z", "2026-08-18T10:00:00.000Z"),
    ).toBe(0);
  });

  it("funciona atravessando a virada do dia", () => {
    expect(
      duracaoEmMinutos("2026-08-18T23:30:00.000Z", "2026-08-19T00:30:00.000Z"),
    ).toBe(60);
  });
});

describe("ordenarPorHorarioDesc", () => {
  it("ordena do mais recente para o mais antigo", () => {
    const antigo = registro("a", "CHECK_IN", emDiasAtras(2));
    const meio = registro("b", "CHECK_OUT", emDiasAtras(1));
    const recente = registro("c", "CHECK_IN", emDiasAtras(0));

    const ordenado = ordenarPorHorarioDesc([meio, antigo, recente]);

    expect(ordenado.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("nao muta o array original", () => {
    const lista = [
      registro("a", "CHECK_IN", emDiasAtras(0)),
      registro("b", "CHECK_OUT", emDiasAtras(2)),
    ];
    const copia = [...lista];

    ordenarPorHorarioDesc(lista);

    expect(lista).toEqual(copia);
  });
});

describe("calcularSessoesCompletas", () => {
  it("pareia um CHECK_OUT com o CHECK_IN que o precede", () => {
    const historico = [
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 11)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    const sessoes = calcularSessoesCompletas(historico);

    expect(sessoes).toHaveLength(1);
    expect(sessoes[0].inicio.id).toBe("in-1");
    expect(sessoes[0].fim.id).toBe("out-1");
  });

  it("ignora um CHECK_IN em aberto (treino em andamento)", () => {
    const historico = [
      registro("in-2", "CHECK_IN", emDiasAtras(0, 15)),
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 11)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    const sessoes = calcularSessoesCompletas(historico);

    expect(sessoes).toHaveLength(1);
    expect(sessoes[0].fim.id).toBe("out-1");
  });

  it("retorna vazio quando nao ha nenhum CHECK_OUT", () => {
    const historico = [registro("in-1", "CHECK_IN", emDiasAtras(0))];

    expect(calcularSessoesCompletas(historico)).toEqual([]);
  });

  it("retorna vazio para historico vazio", () => {
    expect(calcularSessoesCompletas([])).toEqual([]);
  });

  it("ignora um CHECK_OUT sem CHECK_IN anterior (registro orfao)", () => {
    const historico = [registro("out-orfao", "CHECK_OUT", emDiasAtras(0))];

    expect(calcularSessoesCompletas(historico)).toEqual([]);
  });

  it("nao pareia dois CHECK_OUT seguidos", () => {
    const historico = [
      registro("out-2", "CHECK_OUT", emDiasAtras(0, 12)),
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 11)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    const sessoes = calcularSessoesCompletas(historico);

    // out-2 tem out-1 antes dele, entao nao forma sessao;
    // out-1 tem in-1 antes dele, entao forma.
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0].fim.id).toBe("out-1");
    expect(sessoes[0].inicio.id).toBe("in-1");
  });

  it("encontra multiplas sessoes no mesmo historico", () => {
    const historico = [
      registro("out-2", "CHECK_OUT", emDiasAtras(0, 18)),
      registro("in-2", "CHECK_IN", emDiasAtras(0, 17)),
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 11)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    const sessoes = calcularSessoesCompletas(historico);

    expect(sessoes.map((s) => s.fim.id)).toEqual(["out-2", "out-1"]);
  });
});

describe("calcularStreak", () => {
  it("retorna 0 para historico vazio", () => {
    expect(calcularStreak([])).toBe(0);
  });

  it("conta 1 quando treinou so hoje", () => {
    const historico = [registro("in-1", "CHECK_IN", emDiasAtras(0))];

    expect(calcularStreak(historico)).toBe(1);
  });

  it("conta 1 quando treinou so ontem (streak ainda vivo hoje)", () => {
    const historico = [registro("in-1", "CHECK_IN", emDiasAtras(1))];

    expect(calcularStreak(historico)).toBe(1);
  });

  it("conta dias consecutivos terminando hoje", () => {
    const historico = [
      registro("in-3", "CHECK_IN", emDiasAtras(0)),
      registro("in-2", "CHECK_IN", emDiasAtras(1)),
      registro("in-1", "CHECK_IN", emDiasAtras(2)),
    ];

    expect(calcularStreak(historico)).toBe(3);
  });

  it("para de contar quando ha um dia sem treino no meio", () => {
    const historico = [
      registro("in-3", "CHECK_IN", emDiasAtras(0)),
      registro("in-2", "CHECK_IN", emDiasAtras(1)),
      // dia 2 pulado
      registro("in-1", "CHECK_IN", emDiasAtras(3)),
    ];

    expect(calcularStreak(historico)).toBe(2);
  });

  it("retorna 0 quando o ultimo treino foi ha 2 dias ou mais (streak quebrado)", () => {
    const historico = [registro("in-1", "CHECK_IN", emDiasAtras(2))];

    expect(calcularStreak(historico)).toBe(0);
  });

  it("conta o dia uma unica vez, mesmo com varios registros no mesmo dia", () => {
    const historico = [
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 18)),
      registro("in-2", "CHECK_IN", emDiasAtras(0, 17)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    expect(calcularStreak(historico)).toBe(1);
  });
});

describe("calcularResumoSemanal", () => {
  function sessao(id: string, fim: Date, minutosDeDuracao: number): Sessao {
    const inicio = new Date(fim.getTime() - minutosDeDuracao * 60000);
    return {
      inicio: registro(`${id}-in`, "CHECK_IN", inicio),
      fim: registro(`${id}-out`, "CHECK_OUT", fim),
    };
  }

  it("retorna zeros quando nao ha sessoes", () => {
    expect(calcularResumoSemanal([])).toEqual({ treinos: 0, minutos: 0 });
  });

  it("soma treinos e minutos de sessoes desta semana", () => {
    // Segunda-feira desta semana, para garantir que caia dentro da janela
    // independentemente do dia em que a suite roda.
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);

    const resumo = calcularResumoSemanal([
      sessao("a", hoje, 60),
      sessao("b", hoje, 30),
    ]);

    expect(resumo).toEqual({ treinos: 2, minutos: 90 });
  });

  it("ignora sessoes de semanas anteriores", () => {
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);

    const duasSemanasAtras = new Date();
    duasSemanasAtras.setDate(duasSemanasAtras.getDate() - 14);
    duasSemanasAtras.setHours(12, 0, 0, 0);

    const resumo = calcularResumoSemanal([
      sessao("desta-semana", hoje, 45),
      sessao("antiga", duasSemanasAtras, 120),
    ]);

    expect(resumo).toEqual({ treinos: 1, minutos: 45 });
  });

  describe("limite da semana (semana comeca na segunda)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("inclui a segunda-feira quando hoje e quarta", () => {
      // Quarta, 19/08/2026 (12:00 local)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 19, 12, 0, 0));

      const segunda = new Date(2026, 7, 17, 9, 0, 0);
      const resumo = calcularResumoSemanal([sessao("segunda", segunda, 60)]);

      expect(resumo).toEqual({ treinos: 1, minutos: 60 });
    });

    it("exclui o domingo anterior quando hoje e segunda", () => {
      // Segunda, 17/08/2026 (12:00 local)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));

      const domingoAnterior = new Date(2026, 7, 16, 20, 0, 0);
      const resumo = calcularResumoSemanal([
        sessao("domingo", domingoAnterior, 60),
      ]);

      expect(resumo).toEqual({ treinos: 0, minutos: 0 });
    });

    it("trata domingo como fim da semana, nao inicio", () => {
      // Domingo, 23/08/2026: a semana deve ter comecado na segunda 17/08
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 23, 12, 0, 0));

      const segundaDaMesmaSemana = new Date(2026, 7, 17, 9, 0, 0);
      const resumo = calcularResumoSemanal([
        sessao("segunda", segundaDaMesmaSemana, 30),
      ]);

      expect(resumo).toEqual({ treinos: 1, minutos: 30 });
    });
  });
});

describe("isoParaDatetimeLocal", () => {
  it("formata no padrao aceito por input[type=datetime-local]", () => {
    const data = new Date(2026, 7, 18, 9, 5, 0);

    // Precisa bater com o formato YYYY-MM-DDTHH:mm exatamente
    expect(isoParaDatetimeLocal(data.toISOString())).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("usa o horario local, com zero a esquerda em mes/dia/hora/minuto", () => {
    // 05/02/2026 as 03:07 local
    const data = new Date(2026, 1, 5, 3, 7, 0);

    expect(isoParaDatetimeLocal(data.toISOString())).toBe("2026-02-05T03:07");
  });

  it("faz ida e volta: o valor gerado reconstroi o mesmo minuto local", () => {
    const original = new Date(2026, 10, 30, 23, 59, 0);

    const paraInput = isoParaDatetimeLocal(original.toISOString());
    const reconstruido = new Date(paraInput);

    expect(reconstruido.getFullYear()).toBe(original.getFullYear());
    expect(reconstruido.getMonth()).toBe(original.getMonth());
    expect(reconstruido.getDate()).toBe(original.getDate());
    expect(reconstruido.getHours()).toBe(original.getHours());
    expect(reconstruido.getMinutes()).toBe(original.getMinutes());
  });
});
