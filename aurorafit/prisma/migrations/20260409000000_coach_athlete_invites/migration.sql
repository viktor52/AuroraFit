-- CreateEnum
CREATE TYPE "CoachAthleteInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "CoachAthleteInvite" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "CoachAthleteInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "CoachAthleteInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachAthleteInvite_coachId_idx" ON "CoachAthleteInvite"("coachId");

-- CreateIndex
CREATE INDEX "CoachAthleteInvite_athleteId_idx" ON "CoachAthleteInvite"("athleteId");

-- CreateIndex
CREATE INDEX "CoachAthleteInvite_status_idx" ON "CoachAthleteInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAthleteInvite_coachId_athleteId_status_key" ON "CoachAthleteInvite"("coachId", "athleteId", "status");

-- AddForeignKey
ALTER TABLE "CoachAthleteInvite" ADD CONSTRAINT "CoachAthleteInvite_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAthleteInvite" ADD CONSTRAINT "CoachAthleteInvite_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

