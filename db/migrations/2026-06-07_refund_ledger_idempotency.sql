-- Fase D: persistently enforce idempotent refund quotes and ledger application.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_quote_idempotency_unique
	ON RefundQuote (idempotencyKey);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_ledger_quote_unique
	ON RefundLedger (refundQuoteId);
