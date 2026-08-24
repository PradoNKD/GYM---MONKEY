# GYM MONKEY

[![CI](https://github.com/PradoNKD/GYM---MONKEY/actions/workflows/ci.yml/badge.svg)](https://github.com/PradoNKD/GYM---MONKEY/actions/workflows/ci.yml)

App de registro de ponto de treino (check-in/check-out), com identidade visual estilo GymRats. Cada usuário tem sua própria conta e histórico.

## Funcionalidades

- **Autenticação**: registro e login por e-mail/senha, com JWT (expira em 12h)
- **Check-in/check-out**: um único botão alterna entre "Começar treino" e "Finalizar treino"
- **Histórico agrupado por dia**: os registros vêm separados sob "Hoje", "Ontem" ou a data, do dia mais recente para o mais antigo, com a duração calculada de cada treino concluído. O cabeçalho do dia fica fixo no topo enquanto se rola a lista
- **Correção/exclusão de registros**: dá pra editar o horário ou apagar um check-in/check-out esquecido direto na tela
- **Streak e resumo semanal**: dias seguidos treinando (🔥) + total de treinos e tempo treinado na semana atual
- **PWA instalável**: manifest + service worker (`vite-plugin-pwa`), com o ícone oficial do GYM-MONKEY — dá pra instalar na tela inicial do celular
- **Segurança**: rate limiting no login/registro (5 tentativas/min), política de senha (mínimo 8 caracteres, letra+número), validação e limite de tamanho em todos os campos de entrada

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: NestJS + Prisma (SQLite) + JWT + bcrypt

## Como rodar localmente

```bash
# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run start:dev   # http://localhost:3000

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Mais detalhes de endpoints da API em [backend/README.md](backend/README.md).

Retomando de outra máquina ou continuando o deploy? Ver [docs/HANDOFF.md](docs/HANDOFF.md) — estado atual, setup em máquina nova e o checklist dos passos que faltam.

## Testes

167 testes automatizados no total: 51 no backend e 116 no frontend.

### Backend (Jest)

```bash
cd backend
npm test          # unitarios (services, mockando o Prisma)
npm run test:e2e  # ponta a ponta, HTTP real contra um SQLite de teste isolado
```

- **Unitários** (`src/**/*.spec.ts`): regras de negocio de `AuthService`, `UsersService`, `TimeEntriesService` e `JwtStrategy`.
- **E2E** (`test/*.e2e-spec.ts`): fluxo completo via HTTP (registro, login, toggle check-in/check-out, edicao/exclusao), validacao de payload, isolamento de dados entre usuarios e rate limiting (5 tentativas/min em `/auth`).
- `test:e2e` recria o banco `backend/prisma/test.db` do zero a cada execucao (nao usa o `dev.db`).

### Frontend (Vitest + Testing Library)

```bash
cd frontend
npm test          # roda uma vez
npm run test:watch  # modo watch
npm run test:ui     # interface grafica do Vitest
```

- **`calculos.test.ts`**: a logica de negocio da tela — streak, pareamento de
  sessoes check-in/check-out, resumo semanal (incluindo os limites de
  segunda/domingo, com horario congelado via `vi.setSystemTime`), agrupamento
  por dia, duracao e formatacao. Essas funcoes vivem em `src/calculos.ts`,
  separadas do componente justamente para serem testaveis sem renderizar nada.
- **`api.test.ts`**: montagem das requisicoes (header `Authorization`, metodo,
  corpo) e tratamento de resposta — 204 sem corpo, lista de mensagens de
  validacao, corpo de erro invalido e falha de rede.
- **`AuthContext.test.tsx`**: persistencia da sessao no `localStorage`,
  restauracao ao abrir o app, resiliencia a json corrompido e logout.
- **`AuthScreen.test.tsx`** e **`PontoScreen.test.tsx`**: interacao real do
  usuario (clique, digitacao) via Testing Library, estados de carregando,
  mensagens de erro e confirmacao antes de excluir.

## Vulnerabilidades conhecidas em dependências

Uma aviso de `npm audit` segue em aberto no backend, **sem correção disponível**:

- **`deepmerge-ts` <8.0.0 (alta)** — estouro de pilha ao mesclar objetos recursivos.
  Cadeia: `prisma` (devDependency) → `@prisma/config` → `deepmerge-ts`.
  Roda apenas no **CLI do Prisma**, lendo a nossa própria config — não vai para
  produção e não processa entrada de usuário. O `@prisma/config@7.9.1` (mais
  recente na data desta anotação, 18/08/2026) **ainda fixa `deepmerge-ts@7.1.5`**,
  então `npm audit fix` é um no-op aqui. Forçar um `overrides` quebraria o CLI,
  já que o pin do Prisma é exato — o caminho é aguardar o Prisma atualizar.

Já corrigidas: `tar` (crítica, via `bcrypt` → `@mapbox/node-pre-gyp`) resolvida
subindo para `bcrypt@6.0.0`, que abandonou o node-pre-gyp; `nanoid` (alta) e
`postcss` (moderada) no frontend, via `npm audit fix`.

## Status

**No ar** 🎉 — https://pradonkd.github.io/GYM---MONKEY/

Stack gratuita:

- **Frontend**: GitHub Pages (deploy via [`deploy-pages.yml`](.github/workflows/deploy-pages.yml))
- **Backend**: Render — https://gym-monkey-api.onrender.com (blueprint em [`render.yaml`](render.yaml))
- **Banco**: Neon (Postgres gerenciado, região sa-east-1)

Observação: no plano free o backend "dorme" após ~15 min ocioso, então o
primeiro acesso depois de um tempo parado leva ~30–60s (cold start); depois
fica rápido. Passo a passo do deploy e como retomar em [docs/HANDOFF.md](docs/HANDOFF.md).

### Integração contínua

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda a cada
push e pull request na `main`, em dois jobs paralelos:

- **backend**: `npm ci` → `prisma generate` → `tsc --noEmit` → unitários → e2e
- **frontend**: `npm ci` → lint → testes → build

O build do frontend roda depois dos testes de propósito, porque ele também
checa os tipos (`tsc -b`) — já aconteceu de os testes passarem e o build
falhar por erro de tipo, então essa ordem faz o CI pegar os dois casos.

### Backlog

- (deploy concluído; sem itens abertos no momento)
