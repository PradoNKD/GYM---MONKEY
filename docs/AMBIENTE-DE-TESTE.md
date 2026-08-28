# Ambiente de teste local

Como levantar o app inteiro na sua máquina, com contas já preparadas, para
validar uma mudança **antes** dela chegar no grupo.

Para testar em celular de verdade, veja [TESTE-MOBILE](TESTE-MOBILE.md) — os
dois se combinam: este documento cria os dados, aquele expõe a tela no aparelho.

## Por que existe

Os cenários que mais importam são os difíceis de produzir clicando: sequência de
várias semanas, congelamento gasto, reparo disponível, modo recomeço. Nenhum
deles se alcança em um dia de uso, e **testar só o caminho feliz é quase não
testar**. O script monta todos eles de uma vez.

## Subir

Precisa de um Postgres local rodando (o `.env` do backend já aponta para
`gym_monkey_dev`).

```bash
# 1. Schema em dia
cd backend
npx prisma migrate dev

# 2. Contas de teste com cenários prontos
npm run semear-teste

# 3. API (recompila a cada alteração)
npm run start:dev

# 4. Em outro terminal: a tela
cd frontend
npm run dev
```

A tela sobe em <http://localhost:5173> e fala com a API em
<http://localhost:3000> (é o que está no `frontend/.env`).

## As contas

Senha de todas: **`teste1234`**

| Conta | O que ela exercita |
|---|---|
| `ana@teste.local` | Caminho comum: 3 semanas seguidas, 2/3 nesta semana, treinos com registro preenchido e um sem nada |
| `bruno@teste.local` | Semana passada **CONGELADA**: a sequência não avançou nem zerou, e sobrou 1 congelamento |
| `carla@teste.local` | Semana passada **PERDIDA** com os dois congelamentos já gastos: mostra o aviso de reparo |
| `diego@teste.local` | Quatro semanas sem treinar: **modo recomeço**, que precisa aparecer sem nenhuma cobrança |
| `elis@teste.local` | Conta nova, tudo zerado: o estado vazio de todas as telas |
| `felipe@teste.local` | Meta 6, mais sessões `SHORT` e `AUTO_CLOSED` no histórico com o aviso de "não conta" |
| `gabi@teste.local` | **Supervisora**: abre o painel, corrige treino de qualquer um e pode mexer no início |

As semanas fechadas são calculadas na primeira leitura de `/sessions` — o
fechamento é preguiçoso, não agendado. Basta entrar com a conta que os números
aparecem.

Para apagar só as contas de teste (todas terminam em `@teste.local`):

```bash
npm run semear-teste -- --limpar
```

## A trava contra produção

O script **recusa rodar** se a `DATABASE_URL` não apontar para um host local, e
a checagem é por lista de permissão, não de bloqueio.

Não é preciosismo: ele inventa usuários, e a API **não tem rota de exclusão de
usuário**. Contas falsas criadas no Neon ficariam para sempre na lista e
apareceriam no painel "quem sumiu" (v1.2) e no placar (v1.3). É exatamente o
motivo pelo qual não se cria conta de teste em produção nem à mão.

## Roteiro de validação

Um passe curto que cobre o que costuma quebrar:

1. **Ana** — a home mostra `2/3` com dois pontos preenchidos e "Falta 1 treino".
   O histórico mostra os chips e a anotação. Trocar a meta para 5 tem de avisar
   que só vale a partir da próxima segunda, **sem** mudar o número de agora.
2. **Começar e finalizar um treino** com a Ana — ao finalizar, o formulário de
   registro abre sozinho e destacado. Marcar dois tipos, esforço, salvar, e
   conferir se aparece no histórico. Reabrir e editar tem de funcionar quantas
   vezes quiser, **sem** gastar a correção (o lápis continua lá).
3. **Carla** — o aviso de reparo aparece dizendo quantos treinos recuperam a
   sequência.
4. **Diego** — o texto é de recomeço, e não pode haver nada dizendo o que ele
   perdeu.
5. **Felipe** — as sessões que não contam aparecem com o aviso, e a meta é 6.
6. **Gabi** — o painel abre; corrigir o treino de outra pessoa funciona.
7. **Tema claro/escuro** em pelo menos uma dessas telas.

## Ambiente compartilhado (staging)

Hoje **não existe**, e vale saber por quê antes de pedir: o frontend está no
GitHub Pages, que publica **um site por repositório**. Um staging de verdade
exigiria outro host para a tela (ou um subcaminho e um segundo workflow), mais
um serviço no Render e mais um banco no Neon.

Enquanto o grupo é pequeno, o par "ambiente local + `/health` dizendo a versão
no ar" resolve o mesmo problema por muito menos.
