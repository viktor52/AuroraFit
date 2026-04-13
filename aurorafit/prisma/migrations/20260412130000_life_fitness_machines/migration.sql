-- CreateTable
CREATE TABLE "LifeFitnessMachine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "series" TEXT,
    "purpose" TEXT NOT NULL,
    "muscleGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficultyLevel" TEXT,
    "movementType" TEXT,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "LifeFitnessMachine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LifeFitnessMachine_name_idx" ON "LifeFitnessMachine"("name");
