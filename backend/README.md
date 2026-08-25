# GYM-MONKEY API

Backend do app de Registro de Ponto: autenticacao por usuario (JWT) e persistencia de check-in/check-out em banco de dados (PostgreSQL via Prisma).

## Como rodar

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run start:dev
```

A API sobe em `http://localhost:3000`.

## Endpoints

- `POST /auth/register` `{ name, email, password }` — cria usuario e retorna `{ accessToken, user }`
- `POST /auth/login` `{ email, password }` — autentica e retorna `{ accessToken, user }`
- `GET /time-entries` — histórico do usuario autenticado (header `Authorization: Bearer <token>`)
- `POST /time-entries/toggle` — registra check-in ou check-out (alterna automaticamente com base no ultimo registro do usuario)
