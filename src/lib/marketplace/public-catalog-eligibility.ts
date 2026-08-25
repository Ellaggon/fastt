import { and, eq, Product, Provider } from "@/shared/infrastructure/db/compat"

/**
 * Anonymous marketplace visibility is a property of both inventory and owner.
 * A production product owned by a demo, fixture, or integration provider is
 * never a public listing.
 */
export function publicCatalogProviderEligibility() {
	return and(
		eq(Provider.accountPurpose, "commercial"),
		eq(Provider.dataClassification, "production")
	)
}

export function publicCatalogProductEligibility() {
	return and(eq(Product.dataClass, "production"), publicCatalogProviderEligibility())
}
