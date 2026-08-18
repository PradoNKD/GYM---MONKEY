# Handoff — estado do projeto e próximos passos

Documento pra retomar o trabalho de qualquer máquina. Vive no repositório de
propósito: `git clone` já te entrega tudo isto, sem depender de nenhuma outra
ferramenta.

Última atualização: 2026-08-18.

---

## Onde o projeto está

App de check-in de academia funcionando **localmente**, ainda **não publicado**.
Frontend (React+Vite) + backend (NestJS) + Postgres, com autenticação por
usuário, histórico agrupado por dia, streak/resumo semanal e PWA.

**Qualidade:** 186 testes automatizados (70 no backend, 116 no frontend),
rodando em CI (GitHub Actions) a cada push/PR. Badge no [README](../README.md).

### Deploy: o que já foi feito

- **Passo 1 — endurecimento de segurança** (commit `34de999`): fail-fast de
  `JWT_SECRET` no boot (sem segredo forte o app não sobe), `/health`, `trust
  proxy` pro rate limiting atrás de proxy, `prisma migrate deploy` no release,
  `engines` fixando o Node.
- **Passo 2 — migração pra Postgres** (commit `9545c37`): Prisma trocado de
  SQLite pra `postgresql`, migration nativa gerada, testes rodando contra
  Postgres (local e um container `postgres:17` no CI). CI verde.

### Deploy: o que falta (passos 3–5)

Stack gratuita escolhida: **GitHub Pages** (frontend) + **Render** (backend) +
**Neon** (Postgres). Railway foi descartado por ser pago. Trade-off aceito: o
backend no Render "dorme" após 15 min ocioso e o primeiro acesso demora
~30–60s (cold start) — ok pra fase de validação.

3. **Deploy do backend no Render + banco no Neon**
4. **Frontend no GitHub Pages** apontando pra API do Render
5. **Travar CORS** (FRONTEND_URL) e validar fim a fim

O detalhamento e o checklist de contas estão no fim deste documento.

---

## Rodar localmente numa máquina nova

Pré-requisitos: **Node 22–24** e **PostgreSQL 17** instalados.

```bash
# 1. Banco: criar os dois bancos locais (uma vez)
#    (usuario/senha padrão do Postgres local: postgres/postgres)
psql -U postgres -c "CREATE DATABASE gym_monkey_dev;"
psql -U postgres -c "CREATE DATABASE gym_monkey_test;"

# 2. Backend
cd backend
npm install
cp .env.example .env          # depois edite o .env (ver abaixo)
npx prisma migrate deploy      # cria as tabelas no gym_monkey_dev
npm run start:dev              # http://localhost:3000

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

**Editar o `backend/.env`** (não é versionado — tem segredo):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gym_monkey_dev?schema=public"
JWT_SECRET="<gere um de 32+ chars>"
PORT=3000
FRONTEND_URL="http://localhost:5173"
```

Gerar um `JWT_SECRET` forte:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Testes

```bash
# Backend (precisa do Postgres de teste rodando)
cd backend
npm test           # 37 unitários
npm run test:e2e   # 33 e2e (usa o banco gym_monkey_test)

# Frontend
cd frontend
npm test           # 116 testes (Vitest)
```

O banco de teste vem de `TEST_DATABASE_URL` (default local em
`test/test-db-url.js`); no CI é um Postgres de serviço.

---

## Checklist dos passos 3–5 (quando for retomar o deploy)

Estas etapas exigem contas suas (login no navegador). A ordem importa: o
Render precisa da URL do Neon, e o frontend precisa da URL do Render.

### 3a. Neon (Postgres de produção) — grátis, sem cartão

1. Criar conta em neon.com e um projeto (região mais perto do Brasil).
2. Copiar a **connection string** (Connection Details) — algo como
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`.
3. Guardar essa URL: vai no `DATABASE_URL` do Render.

### 3b. Render (backend) — web service free

1. Criar conta em render.com, conectar o repositório do GitHub.
2. New > Web Service, root directory `backend`.
3. Build command: `npm ci && npm run build` — Start: `npm run release && npm run start:prod`
   (o `release` roda `prisma migrate deploy` no Neon antes de subir).
4. Variáveis de ambiente:
   - `DATABASE_URL` = a connection string do Neon
   - `JWT_SECRET` = um segredo **novo**, forte, só de produção (gerar como acima)
   - `FRONTEND_URL` = a URL final do GitHub Pages (ver 4) — pode preencher depois
   - `NODE_VERSION` = 22 (ou 24)
5. Health check path: `/health`.
6. Anotar a URL pública do serviço (ex.: `https://gym-monkey-api.onrender.com`).

### 4. Frontend no GitHub Pages

1. Falta preparar (do lado do código): ajustar o `base` do Vite pro subcaminho
   `/GYM---MONKEY/`, ajustar o PWA, e criar o workflow de deploy pro Pages.
2. O build do frontend precisa do `VITE_API_URL` = URL do Render (passo 3b).
3. Ligar o Pages em Settings > Pages do repositório (source: GitHub Actions).

### 5. Fechar o ciclo

1. Preencher `FRONTEND_URL` no Render com a URL do Pages e redeploy (trava o CORS).
2. Smoke test real: registrar → login → check-in → check-out na URL pública.
3. Conferir o cold start (primeiro acesso após ocioso demora ~30–60s).

---

## Notas e pendências

- **Vulnerabilidade sem correção**: `deepmerge-ts` (via Prisma CLI, devDep) —
  detalhes no [README](../README.md#vulnerabilidades-conhecidas-em-dependências).
  Aguardando o Prisma atualizar.
- **Avisos de CI não-bloqueantes**: deprecação do `actions/checkout@v4` e
  `setup-node@v4` (Node 20→24) — dá pra subir pra `@v5` quando quiser; e um
  warning cosmético de fast-refresh no `AuthContext.tsx`.
- **Branch**: trabalho todo na `main`; sem branches abertas.
