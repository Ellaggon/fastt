// application/search/SearchAvailabilityService.ts

export class SearchAvailabilityService {
	constructor(
		private inventoryRepo: any,
		private pricingRepo: any,
		private restrictionRepo: any
	) {}

	async search(params: { entityType: string; checkIn: string; checkOut: string; guests: number }) {
		const variants = await this.inventoryRepo.getAvailableVariants(
			params.entityType,
			params.checkIn,
			params.checkOut
		)

		const results = []

		for (const variant of variants) {
			const price = await this.pricingRepo.getTotalPrice(
				variant.id,
				params.checkIn,
				params.checkOut
			)

			const restrictions = await this.restrictionRepo.validate(
				variant.id,
				params.checkIn,
				params.checkOut
			)

			if (!restrictions.allowed) continue

			results.push({
				variantId: variant.id,
				price,
			})
		}

		return results
	}
}
