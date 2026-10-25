CREATE TABLE "ProviderCommercialAgreement" (
 "id" text PRIMARY KEY,
 "providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE RESTRICT,
 "line" text NOT NULL DEFAULT 'tour' CHECK ("line" = 'tour'),
 "version" integer NOT NULL CHECK ("version" > 0),
 "status" text NOT NULL DEFAULT 'requested' CHECK ("status" IN ('requested','offered','accepted','withdrawn')),
 "termsJson" jsonb,
 "termsHash" text,
 "authorizedSignerUserId" text REFERENCES "User"("id"),
 "representationReference" text,
 "requestedByUserId" text NOT NULL REFERENCES "User"("id"),
 "offeredByUserId" text REFERENCES "User"("id"),
 "offeredAt" timestamptz,
 "acceptedByUserId" text REFERENCES "User"("id"),
 "acceptedAt" timestamptz,
 "acceptanceHash" text,
 "caseId" text REFERENCES "ComplianceCase"("id"),
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "updatedAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "ProviderCommercialAgreement_offer_check" CHECK ("status" NOT IN ('offered','accepted') OR ("termsJson" IS NOT NULL AND "termsHash" IS NOT NULL AND "authorizedSignerUserId" IS NOT NULL AND "representationReference" IS NOT NULL AND "offeredAt" IS NOT NULL AND "offeredByUserId" IS NOT NULL)),
 CONSTRAINT "ProviderCommercialAgreement_acceptance_check" CHECK ("status" <> 'accepted' OR ("acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "acceptedByUserId" = "authorizedSignerUserId" AND "acceptanceHash" IS NOT NULL AND "acceptanceHash" = "termsHash"))
);
CREATE UNIQUE INDEX "ProviderCommercialAgreement_version_unique" ON "ProviderCommercialAgreement"("providerId","line","version");
CREATE UNIQUE INDEX "ProviderCommercialAgreement_pending_unique" ON "ProviderCommercialAgreement"("providerId","line") WHERE "status" IN ('requested','offered');
CREATE INDEX "ProviderCommercialAgreement_provider_idx" ON "ProviderCommercialAgreement"("providerId","line","status");
CREATE FUNCTION protect_commercial_agreement_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'commercial_agreement_immutable'; END IF;
 IF NEW."providerId" IS DISTINCT FROM OLD."providerId" OR NEW."line" IS DISTINCT FROM OLD."line" OR NEW."version" IS DISTINCT FROM OLD."version" THEN RAISE EXCEPTION 'commercial_agreement_immutable'; END IF;
 IF OLD."status" IN ('accepted','withdrawn') THEN RAISE EXCEPTION 'commercial_agreement_immutable'; END IF;
 IF OLD."status" = 'offered' AND (NEW."termsJson" IS DISTINCT FROM OLD."termsJson" OR NEW."termsHash" IS DISTINCT FROM OLD."termsHash" OR NEW."authorizedSignerUserId" IS DISTINCT FROM OLD."authorizedSignerUserId" OR NEW."representationReference" IS DISTINCT FROM OLD."representationReference" OR NEW."offeredAt" IS DISTINCT FROM OLD."offeredAt" OR NEW."offeredByUserId" IS DISTINCT FROM OLD."offeredByUserId") THEN RAISE EXCEPTION 'commercial_agreement_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ProviderCommercialAgreement_immutable" BEFORE UPDATE OR DELETE ON "ProviderCommercialAgreement" FOR EACH ROW EXECUTE FUNCTION protect_commercial_agreement_version();
