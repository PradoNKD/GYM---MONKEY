import { describe, expect, it } from "vitest";
import {
  agruparSessoesPorDia,
  dataDaChave,
  descricaoDaDuracao,
  formatarMinutos,
  isoParaDatetimeLocal,
  motivoDeNaoContar,
  rotuloDoDia,
  mensagemDeSucesso,
  temFimConfiavel,
} from "./calculos";
import type { Sessao, StatusSessao } from "./types";

// Streak, resumo da semana e pareamento de sessoes saíram deste arquivo na
// v0.9: agora sao calculados no servidor, e estao cobertos lá por
// backend/src/sessions/{tempo,regras}.spec.ts e pelos e2e de sessao. Aqui
// sobrou formatacao e agrupamento para exibir.

function sessao(over: Partial<Sessao> & { dayKey: string }): Sessao {
  const status: StatusSessao = over.status ?? "COMPLETED";
  return {
    id: over.id ?? `s-${over.dayKey}-${Math.random().toString(36).slice(2)}`,
    startedAt: over.startedAt ?? `${over.dayKey}T10:00:00.000Z`,
    // `!== undefined` e nao `??`: os testes precisam poder passar null de
    // proposito (sessao sem fim ou sem duracao gravada).
    endedAt: over.endedAt !== undefined ? over.endedAt : `${over.dayKey}T11:00:00.000Z`,
    durationMin: over.durationMin !== undefined ? over.durationMin : 60,
    status,
    workoutTypes: over.workoutTypes ?? [],
    effort: over.effort !== undefined ? over.effort : null,
    note: over.note !== undefined ? over.note : null,
    source: over.source ?? "APP",
    dayKey: over.dayKey,
    contavel: over.contavel ?? status === "COMPLETED",
    corrigivel: over.corrigivel ?? status !== "OPEN",
  };
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

describe("dataDaChave", () => {
  it("converte o dayKey do servidor em data local do mesmo dia", () => {
    const data = dataDaChave("2026-08-26");

    expect(data.getFullYear()).toBe(2026);
    expect(data.getMonth()).toBe(7); // agosto
    expect(data.getDate()).toBe(26);
  });

  it("usa meio-dia para o dia nao escorregar por causa do fuso", () => {
    // Meia-noite poderia virar o dia anterior em fuso negativo; meio-dia nao.
    expect(dataDaChave("2026-01-01").getHours()).toBe(12);
    expect(dataDaChave("2026-01-01").getDate()).toBe(1);
  });
});

describe("agruparSessoesPorDia", () => {
  it("retorna vazio quando nao ha sessoes", () => {
    expect(agruparSessoesPorDia([])).toEqual([]);
  });

  it("junta num unico grupo as sessoes do mesmo dia", () => {
    const grupos = agruparSessoesPorDia([
      sessao({ dayKey: "2026-08-26", id: "a" }),
      sessao({ dayKey: "2026-08-26", id: "b" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].sessoes.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("separa dias diferentes preservando a ordem que veio do servidor", () => {
    const grupos = agruparSessoesPorDia([
      sessao({ dayKey: "2026-08-26", id: "hoje" }),
      sessao({ dayKey: "2026-08-25", id: "ontem" }),
      sessao({ dayKey: "2026-08-24", id: "antes" }),
    ]);

    expect(grupos.map((g) => g.chave)).toEqual(["2026-08-26", "2026-08-25", "2026-08-24"]);
  });

  it("agrupa pelo dayKey do servidor, nao recalculando pelo timestamp", () => {
    // Treino as 22h em Sao Paulo: o timestamp UTC cai no dia seguinte, mas o
    // servidor ja resolveu o dia certo. A tela tem de respeitar isso.
    const grupos = agruparSessoesPorDia([
      sessao({
        dayKey: "2026-08-26",
        startedAt: "2026-08-27T01:00:00.000Z",
        endedAt: "2026-08-27T02:00:00.000Z",
      }),
    ]);

    expect(grupos[0].chave).toBe("2026-08-26");
    expect(grupos[0].data.getDate()).toBe(26);
  });

  it("nao perde nenhuma sessao ao agrupar", () => {
    const entrada = [
      sessao({ dayKey: "2026-08-26" }),
      sessao({ dayKey: "2026-08-26" }),
      sessao({ dayKey: "2026-08-25" }),
      sessao({ dayKey: "2026-08-24" }),
    ];

    const total = agruparSessoesPorDia(entrada).reduce((n, g) => n + g.sessoes.length, 0);
    expect(total).toBe(entrada.length);
  });

  it("nao muta a lista recebida", () => {
    const entrada = [sessao({ dayKey: "2026-08-26" }), sessao({ dayKey: "2026-08-25" })];
    const copia = [...entrada];

    agruparSessoesPorDia(entrada);

    expect(entrada).toEqual(copia);
  });
});

describe("descricaoDaDuracao", () => {
  it("mostra a duracao de uma sessao concluida", () => {
    expect(descricaoDaDuracao(sessao({ dayKey: "2026-08-26", durationMin: 90 }))).toBe(
      "1h 30min",
    );
  });

  it("sessao em andamento nao mostra numero", () => {
    expect(
      descricaoDaDuracao(
        sessao({ dayKey: "2026-08-26", status: "OPEN", endedAt: null, durationMin: null }),
      ),
    ).toBe("em andamento");
  });

  it("AUTO_CLOSED nunca mostra as 6h que o servidor gravou", () => {
    // Caso real de producao: quem esqueceu de finalizar tem 360 min gravados,
    // e exibir "6h" seria mentira -- a pessoa nao treinou 6 horas.
    const esquecida = sessao({
      dayKey: "2026-08-26",
      status: "AUTO_CLOSED",
      durationMin: 360,
      contavel: false,
    });

    const texto = descricaoDaDuracao(esquecida);

    expect(texto).toBe("nao finalizado");
    expect(texto).not.toContain("6h");
    expect(texto).not.toContain("360");
  });

  it("sessao curta mostra a duracao real", () => {
    expect(
      descricaoDaDuracao(
        sessao({ dayKey: "2026-08-26", status: "SHORT", durationMin: 5, contavel: false }),
      ),
    ).toBe("5min");
  });

  it("sem duracao gravada, nao inventa numero", () => {
    expect(
      descricaoDaDuracao(
        sessao({ dayKey: "2026-08-26", status: "SHORT", durationMin: null, contavel: false }),
      ),
    ).toBe("-");
  });
});

describe("temFimConfiavel", () => {
  it("sessao concluida mostra o fim", () => {
    expect(temFimConfiavel(sessao({ dayKey: "2026-08-26" }))).toBe(true);
  });

  it("AUTO_CLOSED nao mostra o fim, que e sintetico (inicio + 6h)", () => {
    // Exibir "18:00 - 00:00" sugeriria treino ate meia-noite.
    expect(
      temFimConfiavel(
        sessao({
          dayKey: "2026-08-26",
          status: "AUTO_CLOSED",
          endedAt: "2026-08-27T03:00:00.000Z",
          durationMin: 360,
          contavel: false,
        }),
      ),
    ).toBe(false);
  });

  it("sessao aberta nao tem fim para mostrar", () => {
    expect(
      temFimConfiavel(
        sessao({ dayKey: "2026-08-26", status: "OPEN", endedAt: null, durationMin: null }),
      ),
    ).toBe(false);
  });
});

describe("motivoDeNaoContar", () => {
  it("sessao contabil nao tem aviso", () => {
    expect(motivoDeNaoContar(sessao({ dayKey: "2026-08-26" }), 20)).toBeNull();
  });

  it("sessao em andamento nao tem aviso (ainda nao acabou)", () => {
    expect(
      motivoDeNaoContar(
        sessao({ dayKey: "2026-08-26", status: "OPEN", endedAt: null, contavel: false }),
        20,
      ),
    ).toBeNull();
  });

  it("explica a sessao curta usando o minimo que o servidor informou", () => {
    const texto = motivoDeNaoContar(
      sessao({ dayKey: "2026-08-26", status: "SHORT", durationMin: 5, contavel: false }),
      20,
    );

    expect(texto).toContain("20 min");
  });

  it("explica a sessao encerrada automaticamente", () => {
    expect(
      motivoDeNaoContar(
        sessao({ dayKey: "2026-08-26", status: "AUTO_CLOSED", contavel: false }),
        20,
      ),
    ).toMatch(/finalizar/);
  });
});

describe("isoParaDatetimeLocal", () => {
  it("formata no padrao aceito por input[type=datetime-local]", () => {
    const data = new Date(2026, 7, 18, 9, 5, 0);

    expect(isoParaDatetimeLocal(data.toISOString())).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("usa o horario local, com zero a esquerda em mes/dia/hora/minuto", () => {
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

describe("rotuloDoDia", () => {
  const referencia = new Date(2026, 7, 19, 15, 0, 0); // quarta, 19/08/2026

  it("rotula o dia da referencia como 'Hoje'", () => {
    expect(rotuloDoDia(new Date(2026, 7, 19, 8, 0, 0), referencia)).toBe("Hoje");
  });

  it("rotula o dia anterior como 'Ontem'", () => {
    expect(rotuloDoDia(new Date(2026, 7, 18, 22, 0, 0), referencia)).toBe("Ontem");
  });

  it("usa dd/mm/aaaa para dias mais antigos", () => {
    expect(rotuloDoDia(new Date(2026, 7, 17, 10, 0, 0), referencia)).toBe("17/08/2026");
  });

  it("ignora a hora ao comparar os dias", () => {
    expect(rotuloDoDia(new Date(2026, 7, 19, 0, 1, 0), referencia)).toBe("Hoje");
    expect(rotuloDoDia(new Date(2026, 7, 19, 23, 59, 0), referencia)).toBe("Hoje");
  });

  it("atravessa a virada de mes corretamente", () => {
    const primeiroDeSetembro = new Date(2026, 8, 1, 10, 0, 0);
    expect(rotuloDoDia(new Date(2026, 7, 31, 10, 0, 0), primeiroDeSetembro)).toBe("Ontem");
  });

  it("atravessa a virada de ano corretamente", () => {
    const primeiroDeJaneiro = new Date(2027, 0, 1, 10, 0, 0);
    expect(rotuloDoDia(new Date(2026, 11, 31, 10, 0, 0), primeiroDeJaneiro)).toBe("Ontem");
    expect(rotuloDoDia(new Date(2026, 11, 30, 10, 0, 0), primeiroDeJaneiro)).toBe(
      "30/12/2026",
    );
  });

  it("usa a data real como referencia quando nenhuma e informada", () => {
    expect(rotuloDoDia(new Date())).toBe("Hoje");
  });

  it("combina com dataDaChave: o dayKey de hoje rotula 'Hoje'", () => {
    const hoje = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const chaveDeHoje = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

    expect(rotuloDoDia(dataDaChave(chaveDeHoje))).toBe("Hoje");
  });
});

describe("mensagemDeSucesso", () => {
  it("diz a duracao e que passou a contar", () => {
    const msg = mensagemDeSucesso(
      sessao({ dayKey: "2026-08-26", durationMin: 55, contavel: true }),
      20,
    );

    expect(msg).toBe("Treino corrigido: 55min, contando na semana.");
  });

  it("avisa quando a correcao foi aceita mas o treino continua nao contando", () => {
    // O caso que fazia parecer bug: corrigir pra 5 min e aceito pelo servidor,
    // e o numero da semana nao mexe. Sem esta frase, "sucesso" mente.
    const msg = mensagemDeSucesso(
      sessao({
        dayKey: "2026-08-26",
        durationMin: 5,
        status: "SHORT",
        contavel: false,
      }),
      20,
    );

    expect(msg).toContain("5min");
    expect(msg).toContain("nao conta na semana");
    expect(msg).toContain("20min");
  });
});
