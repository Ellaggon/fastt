ALTER TABLE "ProviderOptionPreparationSession" ADD COLUMN IF NOT EXISTS "entryIntent" text NOT NULL DEFAULT 'additional_option';
ALTER TABLE "ProviderOptionPreparationSession" ADD COLUMN IF NOT EXISTS "handoffAt" timestamptz;
ALTER TABLE "ProviderOptionPreparationSession" ADD CONSTRAINT "ProviderOptionPreparationSession_entryIntent_check" CHECK ("entryIntent" IN ('first_publication', 'additional_option'));
CREATE UNIQUE INDEX "ProviderOptionPreparationSession_first_active_idx" ON "ProviderOptionPreparationSession" ("providerId", "userId", "productId") WHERE "entryIntent" = 'first_publication' AND "status" = 'active';
CREATE OR REPLACE FUNCTION fastt_option_entry_intent_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."entryIntent" IS DISTINCT FROM OLD."entryIntent" THEN RAISE EXCEPTION 'option_entry_intent_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ProviderOptionPreparationSession_entry_intent_guard" BEFORE UPDATE ON "ProviderOptionPreparationSession" FOR EACH ROW EXECUTE FUNCTION fastt_option_entry_intent_guard();
