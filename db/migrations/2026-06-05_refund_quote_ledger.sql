-- Financial refund calculation engine: quote before cancellation, ledger when applied.
CREATE TABLE IF NOT EXISTS RefundQuote (
	id TEXT PRIMARY KEY NOT NULL,
	bookingId TEXT NOT NULL,
	providerId TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('quoted', 'requires_manual_review', 'expired', 'superseded')),
	reason TEXT NOT NULL,
	currency TEXT NOT NULL,
	grossAmount REAL NOT NULL,
	refundAmount REAL NOT NULL,
	nonRefundableAmount REAL NOT NULL,
	taxFeeRefundAmount REAL NOT NULL,
	payoutImpactAmount REAL NOT NULL,
	paymentDueLocal TEXT,
	cancellationDeadlineLocal TEXT,
	refundPercent REAL,
	policySnapshotJson JSON NOT NULL,
	linesJson JSON NOT NULL,
	calculationSnapshotJson JSON NOT NULL,
	idempotencyKey TEXT NOT NULL,
	quotedAt INTEGER NOT NULL,
	expiresAt INTEGER,
	createdBy TEXT,
	createdAt INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_quote_idempotency
	ON RefundQuote (idempotencyKey);

CREATE INDEX IF NOT EXISTS idx_refund_quote_booking
	ON RefundQuote (bookingId);

CREATE INDEX IF NOT EXISTS idx_refund_quote_provider_status
	ON RefundQuote (providerId, status);

CREATE INDEX IF NOT EXISTS idx_refund_quote_quoted_at
	ON RefundQuote (quotedAt);

CREATE TABLE IF NOT EXISTS RefundLedger (
	id TEXT PRIMARY KEY NOT NULL,
	refundQuoteId TEXT NOT NULL,
	bookingId TEXT NOT NULL,
	providerId TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('recorded', 'reversed', 'voided')),
	currency TEXT NOT NULL,
	refundAmount REAL NOT NULL,
	payoutImpactAmount REAL NOT NULL,
	paymentTransactionId TEXT,
	externalReference TEXT,
	basis TEXT NOT NULL,
	calculationSnapshotJson JSON NOT NULL,
	appliedAt INTEGER NOT NULL,
	appliedBy TEXT,
	createdAt INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_refund_ledger_booking
	ON RefundLedger (bookingId);

CREATE INDEX IF NOT EXISTS idx_refund_ledger_provider_status
	ON RefundLedger (providerId, status);

CREATE INDEX IF NOT EXISTS idx_refund_ledger_quote
	ON RefundLedger (refundQuoteId);

CREATE INDEX IF NOT EXISTS idx_refund_ledger_payment_transaction
	ON RefundLedger (paymentTransactionId);

CREATE INDEX IF NOT EXISTS idx_refund_ledger_applied_at
	ON RefundLedger (appliedAt);
