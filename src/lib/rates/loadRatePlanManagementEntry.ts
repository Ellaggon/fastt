import { and, db, eq, first, Product } from "@/shared/infrastructure/db/compat"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import {
	buildTourPlaybookHref,
	getTourSharedRateCanonicalHref,
	resolveTourLaunchPlaybookFromUrl,
} from "@/lib/playbook/launch-tour"
import {
	buildCompleteToPublishHref,
	resolveCompleteToPublishPlaybookFromUrl,
} from "@/lib/playbook/complete-to-publish"
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
	const canonicalHref = getTourSharedRateCanonicalHref(url, {
		isTour,
		step: "rate",
		productId,
		variantId: contextVariant?.variantId,
	})
	let redirectHref = canonicalHref
	const requestedStep = url.searchParams.get("step")
	if (isTour && ["conditions", "bookingPolicies"].includes(requestedStep ?? "")) {
		const target = new URL(tourConditionsHref(productId), url)
		target.search = url.search
		target.searchParams.delete("openDialog")
		redirectHref = target.pathname + target.search
	} else if (isTour && !contextVariant) {
		const departureHref = `/product/${encodeURIComponent(productId)}/departures/new`
		redirectHref = resolveCompleteToPublishPlaybookFromUrl(url).active
			? buildCompleteToPublishHref(departureHref, "departure")
			: canonicalHref || resolveTourLaunchPlaybookFromUrl(url).active
				? buildTourPlaybookHref(departureHref, "departure")
				: departureHref
	}
	return { matchedVariant, productId, productType, isTour, notFound, redirectHref }
}
