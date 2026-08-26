-- DropForeignKey
ALTER TABLE "SessionCorrection" DROP CONSTRAINT "SessionCorrection_authorId_fkey";

-- AlterTable
ALTER TABLE "SessionCorrection" ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SessionCorrection" ADD CONSTRAINT "SessionCorrection_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
