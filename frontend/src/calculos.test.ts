import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agruparPorDia,
  calcularResumoSemanal,
  calcularSessoesCompletas,
  calcularStreak,
  duracaoEmMinutos,
  formatarMinutos,
  isoParaDatetimeLocal,
  ordenarPorHorarioDesc,
  rotuloDoDia,
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

describe("agruparPorDia", () => {
  it("retorna vazio para historico vazio", () => {
    expect(agruparPorDia([])).toEqual([]);
  });

  it("junta num unico grupo os registros do mesmo dia", () => {
    const historico = [
      registro("out-1", "CHECK_OUT", emDiasAtras(0, 11)),
      registro("in-1", "CHECK_IN", emDiasAtras(0, 10)),
    ];

    const grupos = agruparPorDia(historico);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].registros.map((r) => r.id)).toEqual(["out-1", "in-1"]);
  });

  it("separa dias diferentes, do mais recente para o mais antigo", () => {
    const historico = [
      registro("hoje", "CHECK_IN", emDiasAtras(0, 10)),
      registro("ontem", "CHECK_IN", emDiasAtras(1, 10)),
      registro("anteontem", "CHECK_IN", emDiasAtras(2, 10)),
    ];

    const grupos = agruparPorDia(historico);

    expect(grupos).toHaveLength(3);
    expect(grupos.map((g) => g.registros[0].id)).toEqual([
      "hoje",
      "ontem",
      "anteontem",
    ]);
  });

  it("ordena os registros dentro do dia do mais recente para o mais antigo", () => {
    const historico = [
      registro("manha", "CHECK_IN", emDiasAtras(0, 7)),
      registro("noite", "CHECK_OUT", emDiasAtras(0, 20)),
      registro("tarde", "CHECK_IN", emDiasAtras(0, 14)),
    ];

    const grupos = agruparPorDia(historico);

    expect(grupos[0].registros.map((r) => r.id)).toEqual([
      "noite",
      "tarde",
      "manha",
    ]);
  });

  it("ordena os grupos mesmo se o historico chegar fora de ordem", () => {
    const historico = [
      registro("antigo", "CHECK_IN", emDiasAtras(3, 10)),
      registro("recente", "CHECK_IN", emDiasAtras(0, 10)),
      registro("meio", "CHECK_IN", emDiasAtras(1, 10)),
    ];

    const grupos = agruparPorDia(historico);

    expect(grupos.map((g) => g.registros[0].id)).toEqual([
      "recente",
      "meio",
      "antigo",
    ]);
  });

  it("usa meia-noite local como data do grupo", () => {
    const grupos = agruparPorDia([
      registro("in-1", "CHECK_IN", emDiasAtras(0, 23, 59)),
    ]);

    const { data } = grupos[0];
    expect(data.getHours()).toBe(0);
    expect(data.getMinutes()).toBe(0);
    expect(data.getSeconds()).toBe(0);
  });

  it("nao muta o historico recebido", () => {
    const historico = [
      registro("a", "CHECK_IN", emDiasAtras(0, 7)),
      registro("b", "CHECK_OUT", emDiasAtras(0, 20)),
    ];
    const copia = historico.map((r) => r.id);

    agruparPorDia(historico);

    expect(historico.map((r) => r.id)).toEqual(copia);
  });

  it("separa em dois dias um treino que atravessa a meia-noite, sem perder registros", () => {
    // CHECK_IN as 23:30 de um dia, CHECK_OUT as 00:30 do dia seguinte
    const inicio = new Date(2026, 7, 18, 23, 30, 0);
    const fim = new Date(2026, 7, 19, 0, 30, 0);

    const historico = [
      registro("out-1", "CHECK_OUT", fim),
      registro("in-1", "CHECK_IN", inicio),
    ];

    const grupos = agruparPorDia(historico);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].registros.map((r) => r.id)).toEqual(["out-1"]);
    expect(grupos[1].registros.map((r) => r.id)).toEqual(["in-1"]);

    // O pareamento continua funcionando sobre o historico completo: agrupar
    // e so exibicao, entao a sessao da virada nao perde a duracao.
    const sessoes = calcularSessoesCompletas(historico);
    expect(sessoes).toHaveLength(1);
    expect(duracaoEmMinutos(sessoes[0].inicio.timestamp, sessoes[0].fim.timestamp)).toBe(60);
  });

  it("preserva todos os registros ao agrupar", () => {
    const historico = [
      registro("a", "CHECK_IN", emDiasAtras(0, 10)),
      registro("b", "CHECK_OUT", emDiasAtras(1, 11)),
      registro("c", "CHECK_IN", emDiasAtras(1, 10)),
      registro("d", "CHECK_IN", emDiasAtras(5, 10)),
    ];

    const grupos = agruparPorDia(historico);
    const idsAgrupados = grupos.flatMap((g) => g.registros.map((r) => r.id));

    expect(idsAgrupados.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("rotuloDoDia", () => {
  const referencia = new Date(2026, 7, 19, 15, 0, 0); // quarta, 19/08/2026

  it("rotula o dia da referencia como 'Hoje'", () => {
    expect(rotuloDoDia(new Date(2026, 7, 19, 8, 0, 0), referencia)).toBe("Hoje");
  });

  it("rotula o dia anterior como 'Ontem'", () => {
    expect(rotuloDoDia(new Date(2026, 7, 18, 22, 0, 0), referencia)).toBe("Ontem");
  });

  it("usa dd/mm/aaaa para dias mais antigos", () => {
    expect(rotuloDoDia(new Date(2026, 7, 17, 10, 0, 0), referencia)).toBe(
      "17/08/2026",
    );
  });

  it("ignora a hora ao comparar os dias", () => {
    expect(rotuloDoDia(new Date(2026, 7, 19, 0, 1, 0), referencia)).toBe("Hoje");
    expect(rotuloDoDia(new Date(2026, 7, 19, 23, 59, 0), referencia)).toBe("Hoje");
  });

  it("atravessa a virada de mes corretamente", () => {
    const primeiroDeSetembro = new Date(2026, 8, 1, 10, 0, 0);
    expect(rotuloDoDia(new Date(2026, 7, 31, 10, 0, 0), primeiroDeSetembro)).toBe(
      "Ontem",
    );
  });

  it("atravessa a virada de ano corretamente", () => {
    const primeiroDeJaneiro = new Date(2027, 0, 1, 10, 0, 0);
    expect(rotuloDoDia(new Date(2026, 11, 31, 10, 0, 0), primeiroDeJaneiro)).toBe(
      "Ontem",
    );
    expect(rotuloDoDia(new Date(2026, 11, 30, 10, 0, 0), primeiroDeJaneiro)).toBe(
      "30/12/2026",
    );
  });

  it("usa a data real como referencia quando nenhuma e informada", () => {
    expect(rotuloDoDia(new Date())).toBe("Hoje");
  });
});
