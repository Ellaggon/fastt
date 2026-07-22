export type DatabaseDomain =
	| "provider"
	| "catalog"
	| "policy"
	| "inventory"
	| "pricing"
	| "taxes"
	| "booking"
	| "financial"

export const databaseTablesByDomain = {
	provider: [
		"Provider",
		"ProviderProfile",
		"ProviderDocument",
		"ProviderTaxConfiguration",
		"ProviderPaymentAccount",
		"ProviderIntegrationConnection",
		"ProviderIntegrationSyncLog",
		"ProviderAuditLog",
		"ProviderComplianceAssignment",
		"ProviderConfigurationState",
		"ProviderVerification",
		"ProviderUser",
		"ProviderInvitation",
		"User",
		"ProviderFinancialProfile",
		"ProviderPayableSnapshot",
		"ProviderStatement",
	],
	catalog: [
		"Destination",
		"RoomType",
		"AmenityRoom",
		"Service",
		"Image",
		"ImageUpload",
		"Translation",
		"Product",
		"HouseRule",
		"ProductStatus",
		"ProductPreparationSnapshot",
		"ProductContent",
		"ProductLocation",
		"Hotel",
		"Tour",
		"Package",
		"Limousine",
		"Variant",
		"VariantCapacity",
		"VariantRoomProfile",
		"VariantRoomBed",
		"VariantRoomAmenity",
		"VariantReadiness",
		"ProductService",
		"ProductServiceAttribute",
	],
	policy: [
		"PolicyGroup",
		"Policy",
		"PolicyAssignment",
		"CancellationTier",
		"PolicyRule",
		"PolicyExceptionRule",
		"PolicyAuditLog",
	],
	inventory: [
		"VariantInventoryConfig",
		"DailyInventory",
		"EffectiveAvailability",
		"InventoryLock",
		"Hold",
	],
	pricing: [
		"SearchUnitView",
		"RatePlan",
		"RatePlanOccupancyPolicy",
		"CommercialRuleSet",
		"CommercialRule",
		"CommercialRuleApplication",
		"EffectiveRestriction",
		"EffectivePricingV2",
	],
	taxes: ["TaxFeeDefinition", "TaxFeeAssignment", "BookingTaxFee"],
	booking: ["Booking", "BookingRoomDetail", "BookingPolicySnapshot"],
	financial: [
		"FinancialExceptionRecord",
		"FinancialReference",
		"RefundHandoffRecord",
		"RefundQuote",
		"RefundLedger",
		"FinancialReviewEvent",
		"PaymentTransaction",
		"FinancialSettlementRecord",
		"ReconciliationMatch",
		"ProviderFinancialProfile",
		"CommissionSnapshot",
		"ProviderPayableSnapshot",
		"PayoutRecord",
		"ProviderStatement",
	],
} as const satisfies Record<DatabaseDomain, readonly string[]>

export const databaseTableNames = [
	...new Set(Object.values(databaseTablesByDomain).flat()),
] as readonly string[]
