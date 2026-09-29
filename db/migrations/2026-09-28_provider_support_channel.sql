CREATE TABLE IF NOT EXISTS "ProviderSupportRequest" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"createdByUserId" text NOT NULL REFERENCES "User"("id"),
	"topic" text NOT NULL,
	"line" text NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"requestKey" text NOT NULL,
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	"updatedAt" timestamptz NOT NULL DEFAULT now(),
	"resolvedAt" timestamptz,
	CONSTRAINT "ProviderSupportRequest_topic_check" CHECK ("topic" IN ('historical_tour_collection', 'verification', 'payments', 'other')),
	CONSTRAINT "ProviderSupportRequest_line_check" CHECK ("line" IN ('tour', 'lodging', 'account')),
	CONSTRAINT "ProviderSupportRequest_status_check" CHECK ("status" IN ('open', 'waiting_provider', 'resolved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderSupportRequest_provider_key_unique"
	ON "ProviderSupportRequest" ("providerId", "requestKey");
CREATE INDEX IF NOT EXISTS "ProviderSupportRequest_provider_updated_idx"
	ON "ProviderSupportRequest" ("providerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ProviderSupportRequest_status_updated_idx"
	ON "ProviderSupportRequest" ("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "ProviderSupportMessage" (
	"id" text PRIMARY KEY,
	"requestId" text NOT NULL REFERENCES "ProviderSupportRequest"("id"),
	"authorUserId" text NOT NULL REFERENCES "User"("id"),
	"authorRole" text NOT NULL,
	"body" text NOT NULL,
	"requestKey" text NOT NULL,
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "ProviderSupportMessage_authorRole_check" CHECK ("authorRole" IN ('provider', 'internal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderSupportMessage_request_key_unique"
	ON "ProviderSupportMessage" ("requestId", "requestKey");
CREATE INDEX IF NOT EXISTS "ProviderSupportMessage_request_created_idx"
	ON "ProviderSupportMessage" ("requestId", "createdAt");
