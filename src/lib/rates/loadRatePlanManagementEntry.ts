import { and, db, eq, first, Product } from "@/shared/infrastructure/db/compat"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import { getTourSharedRateCanonicalHref } from "@/lib/playbook/launch-tour"
import type { ProviderRatePlanVariantChoice } from "./loadProviderRatePlanVariants"
import { tourConditionsHref } from "@/lib/tours/tourConditionsHref"

/** Resolve a rate entry from owned data, including products without any variants. */
export async function loadRatePlanManagementEntry(params: {
	url: URL
	providerId: string
	variantChoices: ProviderRatePlanVariantChoice[]
}) {
	const { url, providerId, variantChoices } = params
	const requestedProductId = String(url.searchParams.get("productId") ?? "").trim()
	const requestedVariantId = String(url.searchParams.get("variantId") ?? "").trim()
	const matchedVariant = variantChoices.find(
		(choice) =>
			choice.variantId === requestedVariantId &&
			(!requestedProductId || choice.productId === requestedProductId)
	)
	const contextVariant =
		matchedVariant ?? variantChoices.find((choice) => choice.productId === requestedProductId)
	const product =
		contextVariant ??
		(requestedProductId
			? await db
					.select({ productId: Product.id, productType: Product.productType })
					.from(Product)
					.where(and(eq(Product.id, requestedProductId), eq(Product.providerId, providerId)))
					.then(first)
			: null)
	const notFound = Boolean((requestedProductId || requestedVariantId) && !product)
	const productId = String(product?.productId ?? "")
	const productType = String(product?.productType ?? "")
	const isTour = isTourProductType(productType)
	const missingOption = Boolean(isTour && productId && !contextVariant)
	const canonicalHref = getTourSharedRateCanonicalHref(url, {
		isTour,
		step: "rate",
		productId,
		variantId: contextVariant?.variantId,
	})
	let redirectHref = canonicalHref
	const requestedStep = url.searchParams.get("step")
	if (
		isTour &&
		url.searchParams.get("playbook") !== "add-tour-option" &&
		["conditions", "bookingPolicies"].includes(requestedStep ?? "")
	) {
		const target = new URL(tourConditionsHref(productId), url)
		target.search = url.search
		target.searchParams.delete("openDialog")
		redirectHref = target.pathname + target.search
	}
	return {
		matchedVariant,
		productId,
		productType,
		isTour,
		notFound,
		missingOption,
		redirectHref,
	}
}
