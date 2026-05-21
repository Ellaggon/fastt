import { describe, expect, it } from "vitest"

import { resolveSearchSellability } from "@/modules/search/application/services/LegacySellabilityCompatibility"

describe("LegacySellabilityCompatibility", () => {
	it("uses EffectiveRestriction as the canonical sellability source", () => {
		const result = resolveSearchSellability({
			restrictionRow: {
				stopSell: false,
				minStay: 3,
				maxStay: 9,
				cta: true,
				ctd: false,
				scope: "variant",
			},
			availabilityRow: {
				availableUnits: 2,
			},
		})

		expect(result).toMatchObject({
			source: "effective_restriction",
			usedMissingEffectiveRestrictionCompatibility: false,
			stopSell: false,
			minStay: 3,
			maxStay: 9,
			cta: true,
			ctd: false,
		})
	})

	it("treats missing EffectiveRestriction as no commercial restriction without consuming availability stopSell", () => {
		const result = resolveSearchSellability({
			restrictionRow: null,
			availabilityRow: {
				availableUnits: 4,
			},
		})

		expect(result).toMatchObject({
			source: "missing_effective_restriction_compatibility",
			usedMissingEffectiveRestrictionCompatibility: true,
			stopSell: false,
			minStay: null,
			cta: false,
			ctd: false,
		})
	})
})
