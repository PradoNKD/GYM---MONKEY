import { describe, expect, it } from "vitest";
import { ABA_INICIAL, ABAS, hashDaAba, lerAba, TITULO_DA_ABA } from "./rota";

describe("lerAba", () => {
  it("le as tres abas", () => {
    expect(lerAba("#/hoje")).toBe("hoje");
    expect(lerAba("#/historico")).toBe("historico");
    expect(lerAba("#/perfil")).toBe("perfil");
  });

  it("aceita o hash sem a barra", () => {
    // Alguns navegadores e alguns links antigos escrevem assim.
    expect(lerAba("#historico")).toBe("historico");
  });

  it("aceita sem o # (o que `window.location.hash` devolve em alguns casos)", () => {
    expect(lerAba("/perfil")).toBe("perfil");
  });

  // Rota vinda da URL e entrada do usuario: link velho, favorito, PWA reabrindo
  // com hash antigo. Tela em branco seria o pior resultado.
  it.each([
    ["vazio", ""],
    ["so o #", "#"],
    ["so a barra", "#/"],
    ["aba que nao existe", "#/grupo"],
    ["lixo", "#/../etc/passwd"],
    ["numero", "#/42"],
  ])("cai na aba inicial quando o hash e %s", (_caso, hash) => {
    expect(lerAba(hash)).toBe(ABA_INICIAL);
  });

  it("ignora query depois da aba", () => {
    expect(lerAba("#/historico?pagina=2")).toBe("historico");
  });

  it("ignora barra sobrando e caixa alta", () => {
    expect(lerAba("#/Historico/")).toBe("historico");
    expect(lerAba("#/PERFIL")).toBe("perfil");
  });

  it("nao confunde aba com prefixo de outra palavra", () => {
    // "hojex" nao e "hoje": casar por prefixo levaria a aba errada.
    expect(lerAba("#/hojex")).toBe(ABA_INICIAL);
    expect(lerAba("#/historico-antigo")).toBe(ABA_INICIAL);
  });
});

describe("hashDaAba", () => {
  it("volta para a mesma aba (ida e volta)", () => {
    for (const aba of ABAS) {
      expect(lerAba(hashDaAba(aba))).toBe(aba);
    }
  });
});

describe("configuracao das abas", () => {
  it("abre em Hoje: e a tela de acao, nao a de consulta", () => {
    expect(ABA_INICIAL).toBe("hoje");
    expect(ABAS[0]).toBe("hoje");
  });

  it("toda aba tem titulo", () => {
    for (const aba of ABAS) {
      expect(TITULO_DA_ABA[aba]).toBeTruthy();
    }
  });

  it("nao ha aba Grupo: com um usuario so, ela abriria vazia (entra na v1.3)", () => {
    expect(ABAS).not.toContain("grupo");
    expect(ABAS).toHaveLength(3);
  });
});
