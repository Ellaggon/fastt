-- TaxFeeDefinition + TaxFeeAssignment are the canonical taxes/fees model.
-- Product-level legacy TaxFee rows are retired before production clients exist.
DROP TABLE IF EXISTS "TaxFee";
