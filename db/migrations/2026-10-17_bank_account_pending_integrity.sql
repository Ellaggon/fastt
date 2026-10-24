-- Preserve evidence: refuse inconsistent existing data instead of picking an account to discard.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ProviderPaymentAccount"
    WHERE "status" = 'pending'
    GROUP BY "providerId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate pending bank accounts before applying bank_account_pending_integrity';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderPaymentAccount_one_pending_per_provider"
  ON "ProviderPaymentAccount" ("providerId") WHERE "status" = 'pending';
