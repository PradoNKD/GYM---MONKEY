/**
 * Qual build esta no ar.
 *
 * Existe por um motivo concreto: em 2026-08-27 subiu uma trava que so aparece
 * para usuario comum, e nao houve como confirmar da rua se o deploy tinha
 * pegado -- o supervisor nao esbarra na regra, e o /health nao dizia nada sobre
 * versao. A unica forma de checar seria criar uma conta de teste em producao,
 * que a API nao sabe apagar (nao ha rota de exclusao de usuario). Uma linha no
 * health check resolve isso para sempre, em toda versao futura.
 *
 * O SHA e informacao publica: o repositorio e publico, entao quem quiser ja le
 * o codigo inteiro de qualquer jeito -- saber o commit nao entrega nada novo. O
 * que ele entrega e a resposta de "o que exatamente esta rodando agora", que
 * hoje custa abrir o painel do Render.
 */

/** SHA curto, no mesmo tamanho que o `git log --oneline` mostra. */
export const TAMANHO_SHA_CURTO = 7;

/** Quando nao da para saber (rodando local, em teste, ou fora do Render). */
export const VERSAO_DESCONHECIDA = 'desconhecida';

/**
 * O Render injeta `RENDER_GIT_COMMIT` no ambiente do servico. As outras duas
 * sao os nomes que Heroku e afins usam -- ficam aqui porque custam nada e
 * evitam ter de mexer nisto se a hospedagem mudar.
 *
 * Nunca lanca: o /health e o que segura o trafego no deploy, entao ele nao
 * pode cair por causa de um campo informativo.
 */
export function versaoDoBuild(ambiente: NodeJS.ProcessEnv = process.env): string {
  const sha =
    ambiente.RENDER_GIT_COMMIT ?? ambiente.GIT_COMMIT ?? ambiente.SOURCE_VERSION;

  if (typeof sha !== 'string' || !sha.trim()) return VERSAO_DESCONHECIDA;

  return sha.trim().slice(0, TAMANHO_SHA_CURTO);
}
