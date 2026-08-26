-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'SHORT', 'AUTO_CLOSED');

-- CreateEnum
CREATE TYPE "SessionSource" AS ENUM ('APP', 'BACKFILL', 'SYSTEM', 'CORRECTION');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMin" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "source" "SessionSource" NOT NULL DEFAULT 'APP',
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionCorrection" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAtBefore" TIMESTAMP(3),
    "startedAtAfter" TIMESTAMP(3),
    "endedAtBefore" TIMESTAMP(3),
    "endedAtAfter" TIMESTAMP(3),
    "statusBefore" "SessionStatus",
    "statusAfter" "SessionStatus",

    CONSTRAINT "SessionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Membership_groupId_idx" ON "Membership"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_groupId_key" ON "Membership"("userId", "groupId");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_dayKey_idx" ON "WorkoutSession"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_startedAt_idx" ON "WorkoutSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkoutSession_groupId_dayKey_idx" ON "WorkoutSession"("groupId", "dayKey");

-- CreateIndex
CREATE INDEX "SessionCorrection_sessionId_idx" ON "SessionCorrection"("sessionId");

-- CreateIndex
CREATE INDEX "SessionCorrection_authorId_idx" ON "SessionCorrection"("authorId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCorrection" ADD CONSTRAINT "SessionCorrection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCorrection" ADD CONSTRAINT "SessionCorrection_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Uma pessoa nao pode ter dois treinos abertos ao mesmo tempo. O Prisma nao
-- expressa indice parcial, entao vai em SQL puro: assim a garantia mora no
-- banco, e nao apenas na regra de servico -- nem uma corrida de dois cliques
-- simultaneos consegue furar.
CREATE UNIQUE INDEX "WorkoutSession_um_aberto_por_usuario"
    ON "WorkoutSession" ("userId")
    WHERE "status" = 'OPEN';

-- Grupo padrao. Hoje existe um grupo so, mas o modelo ja nasce multi-grupo:
-- criar as tabelas sem vincular ninguem deixaria o trabalho de vinculo pra
-- depois, com dados em producao -- exatamente o que se queria evitar.
INSERT INTO "Group" ("id", "name", "slug", "createdAt")
VALUES (gen_random_uuid()::text, 'GYM MONKEY', 'gym-monkey', CURRENT_TIMESTAMP);

-- Todo usuario existente entra no grupo padrao.
INSERT INTO "Membership" ("id", "userId", "groupId", "createdAt")
SELECT gen_random_uuid()::text, u."id", g."id", CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Group" g
WHERE g."slug" = 'gym-monkey';
