import { SetMetadata } from '@nestjs/common';

export const LIMITE_POR_CONTA = 'limite-por-conta';

/**
 * Marca a rota como alvo de força bruta **contra uma conta específica** (hoje:
 * o login).
 *
 * Nessas rotas o rate limit não pode contar só por IP. Na academia todo mundo
 * sai pelo mesmo IP: com o limite por IP, três pessoas errando a senha ao mesmo
 * tempo travavam o login das outras -- vira negação de serviço contra o próprio
 * grupo. Aqui a contagem é por (IP + e-mail), então errar a senha da sua conta
 * não gasta a cota de ninguém.
 *
 * O teto por IP continua existindo: é o throttler `default`, que segue valendo
 * em cima desta rota e impede que um único IP fique rodando e-mails diferentes
 * à vontade.
 */
export const LimitePorConta = () => SetMetadata(LIMITE_POR_CONTA, true);

/**
 * Chave de contagem: IP + e-mail normalizado.
 *
 * O e-mail é normalizado igual ao `AuthService` (trim + minúsculas), senão
 * alternar `A@x.com` e `a@x.com` daria uma cota nova a cada variação.
 *
 * Atenção: guards rodam **antes** do ValidationPipe, então o corpo aqui ainda
 * não foi validado -- pode não ter `email`, ou ter qualquer tipo. Quando não dá
 * pra identificar a conta, todas essas requisições caem no mesmo balde do IP,
 * que é o lado seguro de errar.
 */
export function chavePorConta(req: {
  ip?: string;
  body?: unknown;
}): string {
  const corpo = req.body as { email?: unknown } | undefined;
  const email =
    typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';

  return `${req.ip ?? 'sem-ip'}|${email}`;
}
