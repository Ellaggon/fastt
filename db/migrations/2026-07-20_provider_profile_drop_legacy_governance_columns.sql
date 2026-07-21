-- Remove legacy dual-source columns from ProviderProfile.
-- Canonical ownership:
--   fiscal identity  -> ProviderTaxConfiguration
--   payout readiness -> ProviderPaymentAccount (+ ProviderFinancialProfile derived)
--   integrations     -> ProviderIntegrationConnection (derived)

ALTER TABLE "ProviderProfile" DROP COLUMN "taxResidenceCountry";
ALTER TABLE "ProviderProfile" DROP COLUMN "businessRegistrationNumber";
ALTER TABLE "ProviderProfile" DROP COLUMN "fiscalStatus";
ALTER TABLE "ProviderProfile" DROP COLUMN "paymentReadinessStatus";
ALTER TABLE "ProviderProfile" DROP COLUMN "integrationReadinessStatus";
