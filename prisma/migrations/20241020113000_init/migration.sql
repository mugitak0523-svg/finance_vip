-- CreateTable
CREATE TABLE "IngestLog" (
    "id" TEXT PRIMARY KEY,
    "jobId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "stats" JSONB,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes can be added in later phases as requirements evolve.
