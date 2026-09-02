/**
 * Quanto deslocar a caixa da dica na horizontal para ela caber na tela.
 *
 * Existe por um erro concreto: a primeira versao tinha uma propriedade
 * `abrePara` e eu escolhia o lado **a mao**, por instancia, olhando o layout.
 * Chutei errado -- no iPhone a explicacao das "semanas seguidas" abriu para a
 * esquerda e saiu pela borda, com o texto cortado no meio das palavras.
 *
 * Lado nao se adivinha: depende da largura da tela, de onde o `?` caiu na
 * linha e de quanto texto a dica tem. Aqui a caixa sempre abre para a direita e
 * esta funcao a puxa de volta quando ela passa da borda -- medindo, nao
 * supondo. Fica separada do componente para ser testavel sem layout de
 * navegador, ja que `getBoundingClientRect` devolve zeros no jsdom.
 */

/** Distancia minima que a caixa mantem das bordas da tela. */
export const MARGEM_DA_BORDA = 12;

export function deslocamentoParaCaber(
  caixa: { left: number; right: number },
  larguraDaTela: number,
  margem: number = MARGEM_DA_BORDA,
): number {
  let deslocamento = 0;

  // Passou da borda direita: puxa para a esquerda o tanto que sobrou fora.
  if (caixa.right > larguraDaTela - margem) {
    deslocamento = larguraDaTela - margem - caixa.right;
  }

  // A correcao acima pode ter jogado a caixa para fora da esquerda -- e uma
  // caixa mais larga que a tela sai pelos dois lados. Quando os dois lados
  // brigam, a **esquerda ganha**: e onde o texto comeca, e texto cortado no
  // inicio nao da nem para adivinhar o que dizia.
  if (caixa.left + deslocamento < margem) {
    deslocamento = margem - caixa.left;
  }

  return deslocamento;
}
