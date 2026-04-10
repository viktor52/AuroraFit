-- CreateTable
CREATE TABLE "CoachInviteKey" (
    "id" TEXT NOT NULL,
    "keyDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,

    CONSTRAINT "CoachInviteKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachInviteKey_keyDigest_key" ON "CoachInviteKey"("keyDigest");

-- AddForeignKey
ALTER TABLE "CoachInviteKey" ADD CONSTRAINT "CoachInviteKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
