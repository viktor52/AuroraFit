-- Coach-owned programs and library schedule template
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "createdByCoachId" TEXT;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "libraryDaysPerWeek" INTEGER;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "librarySplitPattern" TEXT;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "libraryCustomTrainingDays" TEXT;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "libraryWeeks" INTEGER;

CREATE INDEX IF NOT EXISTS "Program_createdByCoachId_idx" ON "Program"("createdByCoachId");

ALTER TABLE "Program" ADD CONSTRAINT "Program_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
