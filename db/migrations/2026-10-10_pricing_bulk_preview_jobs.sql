-- Large previews use the same durable operation model as bulk mutations, but
-- never create a CommercialRule nor schedule downstream commercial effects.
ALTER TABLE "PricingBulkOperationJob"
	DROP CONSTRAINT IF EXISTS "PricingBulkOperationJob_operationType_check";

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_operationType_check"
	CHECK ("operationType" IN (
		'create_pricing_rule',
		'preview_pricing_rule',
		'update_pricing_rule',
		'delete_pricing_rule'
	));
