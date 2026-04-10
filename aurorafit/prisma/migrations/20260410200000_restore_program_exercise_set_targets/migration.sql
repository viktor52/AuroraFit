-- Restores setTargets after it was dropped by 20260410180620; API and UI depend on this column.
ALTER TABLE "ProgramExercise" ADD COLUMN IF NOT EXISTS "setTargets" JSONB;
