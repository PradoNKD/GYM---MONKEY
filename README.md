# GYM MONKEY

App de registro de ponto de treino (check-in/check-out), com identidade visual estilo GymRats. Cada usuário tem sua própria conta e histórico.

## Funcionalidades

- **Autenticação**: registro e login por e-mail/senha, com JWT (expira em 12h)
- **Check-in/check-out**: um único botão alterna entre "Começar treino" e "Finalizar treino"
- **Histórico**: lista de check-ins/check-outs com a duração calculada de cada treino concluído
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

## Status

Roda hoje **apenas localmente** (não hospedado). Hospedagem em Railway está planejada para quando o app estiver pronto pra sair do ambiente local — junto com a migração do `JWT_SECRET` de desenvolvimento para um valor forte gerado só em produção.

### Backlog

- Testes automatizados (ainda não há nenhum)
- Histórico agrupado por dia
- Deploy (Railway)
