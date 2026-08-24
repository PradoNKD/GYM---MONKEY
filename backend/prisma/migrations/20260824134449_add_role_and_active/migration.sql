-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPERVISOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';
