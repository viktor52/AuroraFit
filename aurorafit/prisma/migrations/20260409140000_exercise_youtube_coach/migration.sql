-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "youtubeVideoId" TEXT;
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "createdByCoachId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Exercise_createdByCoachId_idx" ON "Exercise"("createdByCoachId");

-- AddForeignKey
ALTER TABLE "Exercise" DROP CONSTRAINT IF EXISTS "Exercise_createdByCoachId_fkey";
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
