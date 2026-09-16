CREATE TABLE IF NOT EXISTS "ProviderHolderProfile" (
	"providerId" text PRIMARY KEY REFERENCES "Provider"("id") ON DELETE CASCADE,
	"holderType" text NOT NULL CHECK ("holderType" IN ('persona_natural', 'entidad')),
	"holderCountry" text NOT NULL CHECK ("holderCountry" ~ '^[A-Z]{2}$'),
	"taxResidenceCountry" text CHECK ("taxResidenceCountry" IS NULL OR "taxResidenceCountry" ~ '^[A-Z]{2}$'),
	"payoutCountry" text CHECK ("payoutCountry" IS NULL OR "payoutCountry" ~ '^[A-Z]{2}$'),
	"collectionModel" text NOT NULL DEFAULT 'undecided' CHECK ("collectionModel" IN ('undecided', 'property_collect', 'platform_collect')),
	"declarationStatus" text NOT NULL DEFAULT 'declared' CHECK ("declarationStatus" IN ('declared', 'in_review', 'verified', 'changes_requested')),
	"declaredByUserId" text,
	"declaredAt" timestamptz NOT NULL DEFAULT now(),
	"updatedAt" timestamptz NOT NULL DEFAULT now()
);
