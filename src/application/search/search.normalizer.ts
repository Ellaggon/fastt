import type { SearchProduct, SearchRatePlan } from "./search.types"

export function normalizeSearchResults(raw: any[]): SearchProduct[] {
	const productsMap = new Map<string, SearchProduct>()

	for (const row of raw) {
		const { product, roomType, ratePlan, pricing, taxes } = row

		if (!productsMap.has(product.id)) {
			productsMap.set(product.id, {
				product,
				variants: [],
			})
		}

		const productEntry = productsMap.get(product.id)!

		let variantEntry = productEntry.variants.find((v) => v.id === roomType.id)

		if (!variantEntry) {
			variantEntry = {
				id: roomType.id,
				name: roomType.name,
				capacity: roomType.capacity ?? null,
				fromPrice: 0,
				ratePlans: [],
			}
			productEntry.variants.push(variantEntry)
		}

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

	for (const p of productsMap.values()) {
		for (const v of p.variants) {
			v.ratePlans.sort((a,b) => a.pricing.total - b.pricing.total)
			
			if (!v.ratePlans.length) {
				v.fromPrice = 0
				continue
			}

			const min = Math.min(...v.ratePlans.map((rp) => rp.pricing.total))

			v.fromPrice = min
		}
	}

	return [...productsMap.values()]
}
