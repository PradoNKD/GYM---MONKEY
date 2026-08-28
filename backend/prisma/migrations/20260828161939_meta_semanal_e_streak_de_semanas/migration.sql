-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('CUMPRIDA', 'CONGELADA', 'PERDIDA');

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "userId" TEXT NOT NULL,
    "meta" INTEGER NOT NULL DEFAULT 3,
    "metaPendente" INTEGER,
    "metaValidaDe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WeeklyResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semanaInicio" TEXT NOT NULL,
    "semanaFim" TEXT NOT NULL,
    "meta" INTEGER NOT NULL,
    "treinos" INTEGER NOT NULL,
    "status" "WeekStatus" NOT NULL,
    "reparo" BOOLEAN NOT NULL DEFAULT false,
    "congelamentoUsado" BOOLEAN NOT NULL DEFAULT false,
    "streakAntes" INTEGER NOT NULL,
    "streakDepois" INTEGER NOT NULL,
    "tokensDepois" INTEGER NOT NULL,
    "streakSalva" INTEGER,
    "cumpridasSeguidas" INTEGER NOT NULL DEFAULT 0,
    "ultimoReparoEm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyResult_userId_semanaInicio_idx" ON "WeeklyResult"("userId", "semanaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyResult_userId_semanaInicio_key" ON "WeeklyResult"("userId", "semanaInicio");

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyResult" ADD CONSTRAINT "WeeklyResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
