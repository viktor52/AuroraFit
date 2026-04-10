-- Surrogate PK + optional per-program-week rows
ALTER TABLE "ProgramExercise" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "ProgramExercise" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "ProgramExercise" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "ProgramExercise" ADD COLUMN IF NOT EXISTS "weekNumber" INTEGER;

ALTER TABLE "ProgramExercise" DROP CONSTRAINT IF EXISTS "ProgramExercise_pkey";
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_pkey" PRIMARY KEY ("id");

CREATE INDEX IF NOT EXISTS "ProgramExercise_programId_weekNumber_idx" ON "ProgramExercise"("programId", "weekNumber");
