-- Coach-saved exercises (API bookmarks)
CREATE TABLE IF NOT EXISTS "CoachExerciseSaved" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachExerciseSaved_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoachExerciseSaved_coachId_exerciseId_key" ON "CoachExerciseSaved"("coachId", "exerciseId");
CREATE INDEX IF NOT EXISTS "CoachExerciseSaved_coachId_idx" ON "CoachExerciseSaved"("coachId");

ALTER TABLE "CoachExerciseSaved" ADD CONSTRAINT "CoachExerciseSaved_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachExerciseSaved" ADD CONSTRAINT "CoachExerciseSaved_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
