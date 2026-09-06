-- Durable document-security and intelligence pipeline.
-- Additive: existing reviews keep their canonical state while every current
-- artifact receives a processing record that can be evaluated in shadow mode.

CREATE TABLE IF NOT EXISTS "ProviderDocumentInspection" (
  "id" text PRIMARY KEY,
  "documentId" text NOT NULL REFERENCES "ProviderDocument"("id") ON DELETE RESTRICT,
  "providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE RESTRICT,
  "processingState" text NOT NULL DEFAULT 'queued'
    CHECK ("processingState" IN ('queued','processing','completed','blocked','failed','awaiting_configuration')),
  "sha256" text,
  "detectedMimeType" text,
  "byteSize" integer,
  "structuralStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("structuralStatus" IN ('pending','valid','suspicious','invalid','error')),
  "malwareStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("malwareStatus" IN ('pending','clean','infected','unavailable','error')),
  "malwareEngine" text,
  "malwareDefinitionVersion" text,
  "ocrStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("ocrStatus" IN ('pending','completed','not_supported','unavailable','error')),
  "ocrProvider" text,
  "ocrLanguage" text,
  "ocrConfidence" numeric(7,4),
  "extractionStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("extractionStatus" IN ('pending','completed','not_supported','unavailable','error')),
  "extractedFieldsJson" jsonb,
  "tamperStatus" text NOT NULL DEFAULT 'pending'
    CHECK ("tamperStatus" IN ('pending','clear','suspected','inconclusive','error')),
  "tamperSignalsJson" jsonb,
  "qualitySignalsJson" jsonb,
  "errorCode" text,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("documentId")
);

CREATE INDEX IF NOT EXISTS "ProviderDocumentInspection_provider_state_idx"
  ON "ProviderDocumentInspection" ("providerId", "processingState");
CREATE INDEX IF NOT EXISTS "ProviderDocumentInspection_malware_tamper_idx"
  ON "ProviderDocumentInspection" ("malwareStatus", "tamperStatus");

CREATE TABLE IF NOT EXISTS "ProviderDocumentProcessingJob" (
  "id" text PRIMARY KEY,
  "documentId" text NOT NULL REFERENCES "ProviderDocument"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'queued'
    CHECK ("status" IN ('queued','processing','retry','blocked','completed','dead_letter')),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "availableAt" timestamptz NOT NULL DEFAULT now(),
  "lockedAt" timestamptz,
  "lockedBy" text,
  "lastErrorCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("documentId")
);

CREATE INDEX IF NOT EXISTS "ProviderDocumentProcessingJob_claim_idx"
  ON "ProviderDocumentProcessingJob" ("status", "availableAt", "createdAt");

-- Every currently relevant file receives a durable inspection/job. Historical
-- verified documents are intentionally included so rollout can measure legacy debt.
INSERT INTO "ProviderDocumentInspection" (
  "id", "documentId", "providerId", "processingState", "createdAt", "updatedAt"
)
SELECT document."id", document."id", document."providerId", 'queued', now(), now()
FROM "ProviderDocument" document
WHERE document."fileUrl" IS NOT NULL
  AND document."status" IN ('pending','verified')
ON CONFLICT ("documentId") DO NOTHING;

INSERT INTO "ProviderDocumentProcessingJob" (
  "id", "documentId", "status", "availableAt", "createdAt", "updatedAt"
)
SELECT 'document-processing:' || document."id", document."id", 'queued', now(), now(), now()
FROM "ProviderDocument" document
WHERE document."fileUrl" IS NOT NULL
  AND document."status" IN ('pending','verified')
ON CONFLICT ("documentId") DO NOTHING;

