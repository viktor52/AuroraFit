-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "ProgramRequestType" AS ENUM ('COACH', 'AI');

-- CreateEnum
CREATE TYPE "ProgramRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProgramRequest" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "type" "ProgramRequestType" NOT NULL,
    "status" "ProgramRequestStatus" NOT NULL DEFAULT 'PENDING',
    "goals" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenDigest_key" ON "Session"("tokenDigest");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ProgramRequest_athleteId_idx" ON "ProgramRequest"("athleteId");

-- CreateIndex
CREATE INDEX "ProgramRequest_status_idx" ON "ProgramRequest"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRequest" ADD CONSTRAINT "ProgramRequest_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

