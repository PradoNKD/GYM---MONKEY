-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('PEITO', 'COSTAS', 'PERNAS', 'OMBROS', 'BRACOS', 'ABDOMEN', 'CARDIO', 'CORPO_INTEIRO', 'OUTRO');

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "effort" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "workoutTypes" "WorkoutType"[];
