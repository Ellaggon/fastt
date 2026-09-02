ALTER TABLE "FinancialReviewEvent"
	ADD COLUMN "paymentTransactionId" text,
	ADD COLUMN "settlementRecordId" text,
	ADD CONSTRAINT "FinancialReviewEvent_paymentTransactionId_fk" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_settlementRecordId_fk" FOREIGN KEY ("settlementRecordId") REFERENCES "FinancialSettlementRecord" ("id"),
	ADD CONSTRAINT "FinancialReviewEvent_external_association_target_check" CHECK (
		("type" = 'external_evidence_associated'
			AND num_nonnulls("paymentTransactionId", "settlementRecordId") = 1
			AND "financialExceptionId" IS NULL AND "financialReferenceId" IS NULL
			AND "refundHandoffId" IS NULL AND "reconciliationMatchId" IS NULL)
		OR ("type" <> 'external_evidence_associated'
			AND "paymentTransactionId" IS NULL AND "settlementRecordId" IS NULL)
	);

CREATE INDEX "FinancialReviewEvent_paymentTransactionId_idx" ON "FinancialReviewEvent" ("paymentTransactionId");
CREATE INDEX "FinancialReviewEvent_settlementRecordId_idx" ON "FinancialReviewEvent" ("settlementRecordId");
CREATE UNIQUE INDEX "FinancialReviewEvent_payment_association_unique" ON "FinancialReviewEvent" ("paymentTransactionId") WHERE "type" = 'external_evidence_associated' AND "paymentTransactionId" IS NOT NULL;
CREATE UNIQUE INDEX "FinancialReviewEvent_settlement_association_unique" ON "FinancialReviewEvent" ("settlementRecordId") WHERE "type" = 'external_evidence_associated' AND "settlementRecordId" IS NOT NULL;

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
	END LOOP;
END;
$$;
DROP TRIGGER IF EXISTS "trg_RefundLedger_lineage" ON "RefundLedger";
DROP TRIGGER IF EXISTS "trg_FinancialReviewEvent_lineage" ON "FinancialReviewEvent";
DROP FUNCTION IF EXISTS fastt_validate_financial_booking_provider();
DROP FUNCTION IF EXISTS fastt_validate_refund_ledger_lineage();
DROP FUNCTION IF EXISTS fastt_validate_financial_review_event_lineage();

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_provider_unique" UNIQUE ("id", "providerId");

ALTER TABLE "FinancialExceptionRecord" ADD CONSTRAINT "FinancialExceptionRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialReference" ADD CONSTRAINT "FinancialReference_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundHandoffRecord" ADD CONSTRAINT "RefundHandoffRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundQuote" ADD CONSTRAINT "RefundQuote_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialSettlementRecord" ADD CONSTRAINT "FinancialSettlementRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "CommissionSnapshot" ADD CONSTRAINT "CommissionSnapshot_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "ProviderPayableSnapshot" ADD CONSTRAINT "ProviderPayableSnapshot_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");

ALTER TABLE "RefundQuote" ADD CONSTRAINT "RefundQuote_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialSettlementRecord" ADD CONSTRAINT "FinancialSettlementRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialExceptionRecord" ADD CONSTRAINT "FinancialExceptionRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReference" ADD CONSTRAINT "FinancialReference_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "RefundHandoffRecord" ADD CONSTRAINT "RefundHandoffRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");

ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_quote_lineage_fk" FOREIGN KEY ("refundQuoteId", "bookingId", "providerId") REFERENCES "RefundQuote" ("id", "bookingId", "providerId");
ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_payment_lineage_fk" FOREIGN KEY ("paymentTransactionId", "bookingId", "providerId") REFERENCES "PaymentTransaction" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_exception_lineage_fk" FOREIGN KEY ("financialExceptionId", "bookingId", "providerId") REFERENCES "FinancialExceptionRecord" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_reference_lineage_fk" FOREIGN KEY ("financialReferenceId", "bookingId", "providerId") REFERENCES "FinancialReference" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_handoff_lineage_fk" FOREIGN KEY ("refundHandoffId", "bookingId", "providerId") REFERENCES "RefundHandoffRecord" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_reconciliation_lineage_fk" FOREIGN KEY ("reconciliationMatchId", "bookingId", "providerId") REFERENCES "ReconciliationMatch" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_payment_lineage_fk" FOREIGN KEY ("paymentTransactionId", "bookingId", "providerId") REFERENCES "PaymentTransaction" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_settlement_lineage_fk" FOREIGN KEY ("settlementRecordId", "bookingId", "providerId") REFERENCES "FinancialSettlementRecord" ("id", "bookingId", "providerId");

CREATE OR REPLACE FUNCTION fastt_prevent_financial_identity_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'Booking' AND NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN RAISE EXCEPTION 'BOOKING_PROVIDER_IDENTITY_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'RefundQuote' AND (NEW."bookingId", NEW."providerId") IS DISTINCT FROM (OLD."bookingId", OLD."providerId") THEN RAISE EXCEPTION 'REFUND_QUOTE_LINEAGE_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'RefundLedger' AND (NEW."refundQuoteId", NEW."bookingId", NEW."providerId", NEW."paymentTransactionId") IS DISTINCT FROM (OLD."refundQuoteId", OLD."bookingId", OLD."providerId", OLD."paymentTransactionId") THEN RAISE EXCEPTION 'REFUND_LEDGER_LINEAGE_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER "trg_Booking_financial_identity" BEFORE UPDATE OF "providerId" ON "Booking" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();
CREATE TRIGGER "trg_RefundQuote_financial_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "RefundQuote" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();
CREATE TRIGGER "trg_RefundLedger_financial_identity" BEFORE UPDATE OF "refundQuoteId", "bookingId", "providerId", "paymentTransactionId" ON "RefundLedger" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();

CREATE OR REPLACE FUNCTION fastt_validate_external_evidence_identity_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN RAISE EXCEPTION 'FINANCIAL_EVIDENCE_PROVIDER_IMMUTABLE'; END IF;
	IF OLD."bookingId" IS NOT NULL AND NEW."bookingId" IS DISTINCT FROM OLD."bookingId" THEN RAISE EXCEPTION 'FINANCIAL_EVIDENCE_BOOKING_IMMUTABLE'; END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER "trg_PaymentTransaction_evidence_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "PaymentTransaction" FOR EACH ROW EXECUTE FUNCTION fastt_validate_external_evidence_identity_transition();
CREATE TRIGGER "trg_FinancialSettlementRecord_evidence_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "FinancialSettlementRecord" FOR EACH ROW EXECUTE FUNCTION fastt_validate_external_evidence_identity_transition();

CREATE OR REPLACE FUNCTION fastt_prevent_financial_review_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FINANCIAL_REVIEW_EVENT_IMMUTABLE'; END; $$;
CREATE TRIGGER "trg_FinancialReviewEvent_immutable" BEFORE UPDATE OR DELETE ON "FinancialReviewEvent" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_review_event_mutation();
