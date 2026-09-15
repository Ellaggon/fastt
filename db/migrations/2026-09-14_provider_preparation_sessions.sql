CREATE TABLE IF NOT EXISTS "ProviderPreparationSession" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE CASCADE,
	"userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
	"productId" text REFERENCES "Product"("id") ON DELETE CASCADE,
	"playbookId" text NOT NULL,
	"vertical" text NOT NULL,
	"stepId" text NOT NULL,
	"variantId" text,
	"ratePlanId" text,
	"lastPath" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	"updatedAt" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "ProviderPreparationSession_playbook_check"
		CHECK ("playbookId" IN ('launch', 'launch-tour')),
	CONSTRAINT "ProviderPreparationSession_vertical_check"
		CHECK ("vertical" IN ('hotel', 'tour')),
	CONSTRAINT "ProviderPreparationSession_status_check"
		CHECK ("status" IN ('active', 'completed', 'abandoned'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderPreparationSession_owner_playbook_unique"
	ON "ProviderPreparationSession" ("providerId", "userId", "playbookId");
CREATE INDEX IF NOT EXISTS "ProviderPreparationSession_owner_status_updated_idx"
	ON "ProviderPreparationSession" ("providerId", "userId", "status", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ProviderPreparationSession_product_idx"
	ON "ProviderPreparationSession" ("productId");
