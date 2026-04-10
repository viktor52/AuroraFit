-- AlterTable
ALTER TABLE "AthleteProgramAssignment"
ADD COLUMN     "daysPerWeek" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "splitPattern" TEXT NOT NULL DEFAULT 'spread',
ADD COLUMN     "weeks" INTEGER NOT NULL DEFAULT 4;

