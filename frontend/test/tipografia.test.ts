import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Este teste vive fora de `src/` de proposito. Ele le arquivo do disco, o que
// exige os tipos do Node -- e `src/` compila para o NAVEGADOR, sem eles. Abrir
// essa porta em `src/` deixaria qualquer codigo de tela importar `fs`.
//
// Tentei antes importar o CSS com `?raw` de dentro de `src/`. Compilava, os
// testes passavam... e passavam VAZIOS: o Vitest roda com `css: false`, entao o
// CSS chega como string vazia e todo filtro devolvia lista vazia. So a
// assercao "achou pelo menos um degrau" revelou isso. Sem ela, este arquivo
// seria quatro testes decorativos.
const PASTA_CSS = join(import.meta.dirname, "..", "src");
const appCss = readFileSync(join(PASTA_CSS, "App.css"), "utf-8");
const indexCss = readFileSync(join(PASTA_CSS, "index.css"), "utf-8");

/**
 * Guarda-trilho da escala de texto.
 *
 * Existe por um problema real: o CSS acumulou **19 tamanhos de fonte**, dez
 * deles entre 0.68 e 0.88rem. Ninguem percebe 0.76 contra 0.78 como intencao --
 * le como desalinhado, e foi o que o dono do produto viu na tela do iPhone.
 *
 * Escala sem guarda volta a apodrecer no primeiro `font-size: 0.83rem` que
 * alguem escrever com pressa. Este teste le o CSS e reprova valor cru, entao a
 * conversa acontece no momento de escrever, e nao seis meses depois olhando a
 * tela torta.
 */

const CSS = [
  { nome: "App.css", texto: appCss },
  { nome: "index.css", texto: indexCss },
];

/** Remove os blocos de comentario, senao um exemplo citado ali viraria falha. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Remove os blocos `@font-face`.
 *
 * Ali dentro `font-family` DEFINE o nome da familia -- e a origem do token, nao
 * um uso solto. Sem esta excecao o guarda reprovaria a propria declaracao da
 * fonte, o que seria pedir para registrar a fonte sem poder nomea-la.
 */
function semFontFace(texto: string): string {
  return texto.replace(/@font-face\s*\{[^}]*\}/g, "");
}

/** As declaracoes de uma propriedade, na ordem em que aparecem. */
function valoresDe(texto: string, propriedade: string): string[] {
  const regex = new RegExp(`${propriedade}:\\s*([^;]+);`, "g");
  return [...semComentarios(texto).matchAll(regex)].map((m) => m[1].trim());
}

describe("escala de texto", () => {
  it("nenhum font-size cru: todo tamanho sai da escala", () => {
    for (const { nome, texto } of CSS) {
      const crus = valoresDe(texto, "font-size").filter(
        (v) => !v.startsWith("var(--txt-"),
      );

      expect(crus, `${nome} tem font-size fora da escala`).toEqual([]);
    }
  });

  it("nenhum letter-spacing cru: rotulo em caixa alta usa o token", () => {
    for (const { nome, texto } of CSS) {
      const crus = valoresDe(texto, "letter-spacing").filter(
        (v) => v !== "normal" && !v.startsWith("var(--tracking-"),
      );

      expect(crus, `${nome} tem letter-spacing fora do token`).toEqual([]);
    }
  });

  it("o peso da fonte fica em 400, 600 ou 700", () => {
    // Tres degraus bastam para hierarquia. O 500 que existia era
    // indistinguivel do 600 e so aumentava a lista de valores possiveis.
    const permitidos = new Set(["400", "600", "700", "inherit"]);

    for (const { nome, texto } of CSS) {
      const fora = valoresDe(texto, "font-weight").filter(
        (v) => !permitidos.has(v),
      );

      expect(fora, `${nome} tem font-weight fora dos tres degraus`).toEqual([]);
    }
  });

  it("todo degrau usado esta definido", () => {
    const definicoes = CSS.map((c) => c.texto).join("\n");
    const usados = new Set(
      CSS.flatMap((c) => valoresDe(c.texto, "font-size")).filter((v) =>
        v.startsWith("var(--txt-"),
      ),
    );

    expect(usados.size).toBeGreaterThan(0);
    for (const uso of usados) {
      const nomeDoToken = uso.slice("var(".length, -1);
      expect(
        definicoes.includes(`${nomeDoToken}:`),
        `${uso} e usado mas nunca definido`,
      ).toBe(true);
    }
  });

  it("nenhuma font-family crua: as duas familias saem de token", () => {
    // Sao dois papeis: --fonte-texto para ler, --fonte-titulo (Anton) para
    // titulo curto. Repetir a pilha a mao foi o que permitiu Anton vazar para
    // dentro da caixa da dica sem ninguem notar.
    for (const { nome, texto } of CSS) {
      const crus = valoresDe(semFontFace(texto), "font-family").filter(
        (v) => !v.startsWith("var(--fonte-"),
      );

      expect(crus, `${nome} tem font-family fora dos tokens`).toEqual([]);
    }
  });

  it("a caixa da dica declara a tipografia dela, sem herdar do rotulo", () => {
    // Problema real, visto no iPhone: a dica do historico nasce dentro de um
    // <h2> com Anton e saiu "toda em negrito"; a da meta nasce dentro de um
    // rotulo em CAIXA ALTA e saiu em maiuscula. Cada dica com uma cara.
    //
    // A caixa e uma superficie propria: tem de declarar familia, peso,
    // espacamento e caixa. Sem estas quatro linhas o defeito volta na proxima
    // dica pendurada num titulo -- e volta silencioso.
    const bloco = /\.dica-caixa\s*\{([^}]*)\}/.exec(semComentarios(appCss));
    expect(bloco, ".dica-caixa nao encontrada no CSS").not.toBeNull();

    const corpo = bloco![1];
    for (const propriedade of [
      "font-family",
      "font-weight",
      "letter-spacing",
      "text-transform",
    ]) {
      expect(
        new RegExp(`${propriedade}:`).test(corpo),
        `.dica-caixa nao reseta ${propriedade}: vai herdar do rotulo em que estiver`,
      ).toBe(true);
    }
  });

  it("campo de formulario nunca fica abaixo de 16px", () => {
    // Nao e estetica: o Safari do iOS DA ZOOM sozinho ao focar um campo com
    // fonte menor que 16px, e a pagina fica deslocada depois. Este teste
    // existe porque o `select` da meta e os campos da correcao estavam em
    // 12px e 14px, e o zoom acontecia de verdade no aparelho.
    const blocos = [...semComentarios(appCss).matchAll(/([^{}]+)\{([^{}]*)\}/g)];

    const camposComFonteErrada = blocos
      .filter(([, seletor, corpo]) => {
        const ehCampo = /\b(input|select|textarea)\b/.test(seletor);
        const fonte = /font-size:\s*([^;]+);/.exec(corpo)?.[1]?.trim();
        return ehCampo && fonte !== undefined && fonte !== "var(--txt-campo)";
      })
      .map(([, seletor]) => seletor.trim().replace(/\s+/g, " "));

    expect(camposComFonteErrada).toEqual([]);
  });
});
