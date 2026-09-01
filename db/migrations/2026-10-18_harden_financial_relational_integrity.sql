-- Financial evidence has two legitimate shapes:
-- 1. booking-bound records, which must reference the booking and its provider;
-- 2. imported payment/settlement evidence awaiting reconciliation, whose
--    bookingId is NULL. Synthetic `unmatched:*` IDs are retired here.

-- These rows were written by historical tests into the development database.
-- A refund quote and its ledger entry without a reservation cannot be retained
-- as financial evidence; there are no related review records to preserve.
DELETE FROM "RefundLedger" ledger
WHERE EXISTS (
	SELECT 1
	FROM "RefundQuote" quote
	LEFT JOIN "Booking" booking ON booking."id" = quote."bookingId"
	WHERE quote."id" = ledger."refundQuoteId"
		AND booking."id" IS NULL
		AND quote."providerId" = 'prov_test'
);

DELETE FROM "RefundQuote" quote
WHERE quote."providerId" = 'prov_test'
	AND NOT EXISTS (SELECT 1 FROM "Booking" booking WHERE booking."id" = quote."bookingId")
	AND EXISTS (
		SELECT 1 FROM "Provider" provider
		WHERE provider."id" = quote."providerId"
			AND provider."legalName" = 'Provider prov_test'
	);

-- Unmatched external evidence remains useful, but it must not masquerade as a
-- foreign key. Its PSP/settlement reference already carries the external ID.
UPDATE "PaymentTransaction"
SET "bookingId" = NULL
WHERE "bookingId" LIKE 'unmatched:%';

UPDATE "FinancialSettlementRecord"
SET "bookingId" = NULL
WHERE "bookingId" LIKE 'unmatched:%';

-- The remaining invalid payment is an integration test artifact, not an
-- imported payment. Remove it deliberately rather than weakening the FK.
DELETE FROM "PaymentTransaction"
WHERE "source" = 'test'
	AND "bookingId" IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "Booking" WHERE "Booking"."id" = "PaymentTransaction"."bookingId");

-- Stop rather than guessing if an unclassified historical row is discovered.
DO $$
DECLARE
	invalid_count integer;
BEGIN
	SELECT count(*) INTO invalid_count
	FROM "RefundQuote" quote LEFT JOIN "Booking" booking ON booking."id" = quote."bookingId"
	WHERE booking."id" IS NULL;
	IF invalid_count > 0 THEN RAISE EXCEPTION 'FINANCIAL_INTEGRITY_UNCLASSIFIED_REFUND_QUOTES:%', invalid_count; END IF;

	SELECT count(*) INTO invalid_count
	FROM "RefundLedger" ledger
	LEFT JOIN "Booking" booking ON booking."id" = ledger."bookingId"
	LEFT JOIN "RefundQuote" quote ON quote."id" = ledger."refundQuoteId"
	WHERE booking."id" IS NULL OR quote."id" IS NULL;
	IF invalid_count > 0 THEN RAISE EXCEPTION 'FINANCIAL_INTEGRITY_UNCLASSIFIED_REFUND_LEDGERS:%', invalid_count; END IF;

	SELECT count(*) INTO invalid_count
	FROM "PaymentTransaction" transaction
	LEFT JOIN "Booking" booking ON booking."id" = transaction."bookingId"
	WHERE transaction."bookingId" IS NOT NULL AND booking."id" IS NULL;
	IF invalid_count > 0 THEN RAISE EXCEPTION 'FINANCIAL_INTEGRITY_UNCLASSIFIED_PAYMENT_TRANSACTIONS:%', invalid_count; END IF;

	SELECT count(*) INTO invalid_count
	FROM "FinancialSettlementRecord" settlement
	LEFT JOIN "Booking" booking ON booking."id" = settlement."bookingId"
	WHERE settlement."bookingId" IS NOT NULL AND booking."id" IS NULL;
	IF invalid_count > 0 THEN RAISE EXCEPTION 'FINANCIAL_INTEGRITY_UNCLASSIFIED_SETTLEMENTS:%', invalid_count; END IF;
END;
$$;

ALTER TABLE "PaymentTransaction" ALTER COLUMN "bookingId" DROP NOT NULL;
ALTER TABLE "FinancialSettlementRecord" ALTER COLUMN "bookingId" DROP NOT NULL;

ALTER TABLE "FinancialExceptionRecord"
	ADD CONSTRAINT "FinancialExceptionRecord_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "FinancialExceptionRecord_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "FinancialReference"
	ADD CONSTRAINT "FinancialReference_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "FinancialReference_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "RefundHandoffRecord"
	ADD CONSTRAINT "RefundHandoffRecord_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "RefundHandoffRecord_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "RefundQuote"
	ADD CONSTRAINT "RefundQuote_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "RefundQuote_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "RefundLedger"
	ADD CONSTRAINT "RefundLedger_refundQuoteId_fk" FOREIGN KEY ("refundQuoteId") REFERENCES "RefundQuote" ("id"),
	ADD CONSTRAINT "RefundLedger_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "RefundLedger_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
	ADD CONSTRAINT "RefundLedger_paymentTransactionId_fk" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id");
ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_financialExceptionId_fk" FOREIGN KEY ("financialExceptionId") REFERENCES "FinancialExceptionRecord" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_financialReferenceId_fk" FOREIGN KEY ("financialReferenceId") REFERENCES "FinancialReference" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_refundHandoffId_fk" FOREIGN KEY ("refundHandoffId") REFERENCES "RefundHandoffRecord" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_reconciliationMatchId_fk" FOREIGN KEY ("reconciliationMatchId") REFERENCES "ReconciliationMatch" ("id");
ALTER TABLE "PaymentTransaction"
	ADD CONSTRAINT "PaymentTransaction_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "PaymentTransaction_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "FinancialSettlementRecord"
	ADD CONSTRAINT "FinancialSettlementRecord_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "FinancialSettlementRecord_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "ReconciliationMatch"
	ADD CONSTRAINT "ReconciliationMatch_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "ReconciliationMatch_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "CommissionSnapshot"
	ADD CONSTRAINT "CommissionSnapshot_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "CommissionSnapshot_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "ProviderPayableSnapshot"
	ADD CONSTRAINT "ProviderPayableSnapshot_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "ProviderPayableSnapshot_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "PayoutRecord"
	ADD CONSTRAINT "PayoutRecord_bookingId_fk" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	ADD CONSTRAINT "PayoutRecord_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");
ALTER TABLE "ProviderStatement"
	ADD CONSTRAINT "ProviderStatement_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id");

CREATE OR REPLACE FUNCTION fastt_validate_financial_booking_provider()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE booking_provider_id text;
BEGIN
	IF NEW."bookingId" IS NULL THEN RETURN NEW; END IF;
	SELECT "providerId" INTO booking_provider_id FROM "Booking" WHERE "id" = NEW."bookingId";
	IF booking_provider_id IS NULL OR booking_provider_id <> NEW."providerId" THEN
		RAISE EXCEPTION 'FINANCIAL_BOOKING_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'FinancialExceptionRecord', 'FinancialReference', 'RefundHandoffRecord', 'RefundQuote',
		'RefundLedger', 'FinancialReviewEvent', 'PaymentTransaction', 'FinancialSettlementRecord',
		'ReconciliationMatch', 'CommissionSnapshot', 'ProviderPayableSnapshot', 'PayoutRecord'
	]
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_booking_provider', table_name);
		EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "bookingId", "providerId" ON %I FOR EACH ROW EXECUTE FUNCTION fastt_validate_financial_booking_provider()', 'trg_' || table_name || '_booking_provider', table_name);
	END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_refund_ledger_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE quote_booking_id text; quote_provider_id text; payment_booking_id text; payment_provider_id text;
BEGIN
	SELECT "bookingId", "providerId" INTO quote_booking_id, quote_provider_id FROM "RefundQuote" WHERE "id" = NEW."refundQuoteId";
	IF quote_booking_id IS NULL OR quote_booking_id <> NEW."bookingId" OR quote_provider_id <> NEW."providerId" THEN
		RAISE EXCEPTION 'REFUND_LEDGER_QUOTE_LINEAGE_MISMATCH';
	END IF;
	IF NEW."paymentTransactionId" IS NOT NULL THEN
		SELECT "bookingId", "providerId" INTO payment_booking_id, payment_provider_id FROM "PaymentTransaction" WHERE "id" = NEW."paymentTransactionId";
		IF payment_provider_id IS NULL OR payment_provider_id <> NEW."providerId" OR payment_booking_id IS DISTINCT FROM NEW."bookingId" THEN
			RAISE EXCEPTION 'REFUND_LEDGER_PAYMENT_LINEAGE_MISMATCH';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_RefundLedger_lineage"
BEFORE INSERT OR UPDATE OF "refundQuoteId", "bookingId", "providerId", "paymentTransactionId"
ON "RefundLedger" FOR EACH ROW EXECUTE FUNCTION fastt_validate_refund_ledger_lineage();

CREATE OR REPLACE FUNCTION fastt_validate_financial_review_event_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."financialExceptionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialExceptionRecord" WHERE "id" = NEW."financialExceptionId" AND "bookingId" = NEW."bookingId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_EXCEPTION_LINEAGE_MISMATCH'; END IF;
	IF NEW."financialReferenceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialReference" WHERE "id" = NEW."financialReferenceId" AND "bookingId" = NEW."bookingId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_REFERENCE_LINEAGE_MISMATCH'; END IF;
	IF NEW."refundHandoffId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "RefundHandoffRecord" WHERE "id" = NEW."refundHandoffId" AND "bookingId" = NEW."bookingId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_HANDOFF_LINEAGE_MISMATCH'; END IF;
	IF NEW."reconciliationMatchId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ReconciliationMatch" WHERE "id" = NEW."reconciliationMatchId" AND "bookingId" = NEW."bookingId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_RECONCILIATION_LINEAGE_MISMATCH'; END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_FinancialReviewEvent_lineage"
BEFORE INSERT OR UPDATE OF "bookingId", "providerId", "financialExceptionId", "financialReferenceId", "refundHandoffId", "reconciliationMatchId"
ON "FinancialReviewEvent" FOR EACH ROW EXECUTE FUNCTION fastt_validate_financial_review_event_lineage();
