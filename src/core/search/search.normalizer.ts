import type { SearchProduct, SearchRatePlan } from "./search.types"

export function normalizeSearchResults(raw: any[]): SearchProduct[] {
	const productsMap = new Map<string, SearchProduct>()

	for (const row of raw) {
		const { product, roomType, ratePlan, pricing, taxes } = row

		// PRODUCT
		if (!productsMap.has(product.id)) {
			productsMap.set(product.id, {
				product,
				variants: [],
			})
		}

		const productEntry = productsMap.get(product.id)!

		// ROOM TYPE
		let variantEntry = productEntry.variants.find((v) => v.id === roomType.id)

		if (!variantEntry) {
			variantEntry = {
				id: roomType.id,
				name: roomType.name,
				capacity: roomType.capacity ?? null,
				ratePlans: [],
			}
			productEntry.variants.push(variantEntry)
		}

		// RATE PLAN
		const rp: SearchRatePlan = {
			id: ratePlan.id,
			name: ratePlan.name,
			refundable: ratePlan.refundable,
			isDefault: ratePlan.isDefault,
			pricing: {
				currency: pricing.currency,
				base: pricing.base,
				taxes: {
					included: taxes.included,
					excluded: taxes.excluded,
				},
				total: pricing.total,
				breakdown: pricing.breakdown,
			},
		}

		variantEntry.ratePlans.push(rp)
	}

	// asegurar 1 default
	for (const p of productsMap.values()) {
		for (const v of p.variants) {
			if (!v.ratePlans.some((rp) => rp.isDefault)) {
				v.ratePlans[0].isDefault = true
			}
		}
	}

	return [...productsMap.values()]
}
