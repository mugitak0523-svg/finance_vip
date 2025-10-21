-- Adjust IngestLog schema to remove defaults and enforce required fields
ALTER TABLE "IngestLog"
  ALTER COLUMN "startedAt" DROP DEFAULT;

UPDATE "IngestLog"
SET "endedAt" = COALESCE("endedAt", "startedAt"),
    "stats"   = COALESCE("stats", '{}'::jsonb);

ALTER TABLE "IngestLog"
  ALTER COLUMN "startedAt" SET NOT NULL,
  ALTER COLUMN "endedAt"   SET NOT NULL,
  ALTER COLUMN "stats"     SET NOT NULL;

-- Create Vip table
CREATE TABLE "Vip" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "org" TEXT,
    "title" TEXT,
    "aliases" TEXT[] NOT NULL,
    "gnewsQueryExtra" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Vip_isActive_idx" ON "Vip" ("isActive");
CREATE INDEX "Vip_name_idx" ON "Vip" ("name");

-- Create Article table
CREATE TABLE "Article" (
    "id" TEXT PRIMARY KEY,
    "url" TEXT NOT NULL,
    "urlNorm" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT 'GoogleNews',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lang" TEXT,
    "personMatch" JSONB,
    "hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Article_urlNorm_key" ON "Article" ("urlNorm");
CREATE INDEX "Article_publishedAt_idx" ON "Article" ("publishedAt");
CREATE INDEX "Article_createdAt_idx" ON "Article" ("createdAt");
CREATE INDEX "Article_sourceName_idx" ON "Article" ("sourceName");
