-- A definition is mutable until an explicit publication creates its immutable
-- version and advances currentVersionId. Direct inserts must therefore be safe
-- by default and must never imply a publication that did not happen.

ALTER TABLE "TaxFeeDefinition"
	ALTER COLUMN "editingState" SET DEFAULT 'draft';
