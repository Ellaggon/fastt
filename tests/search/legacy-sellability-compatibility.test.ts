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
				stopSell: true,
				availableUnits: 2,
			},
		})

		expect(result).toMatchObject({
			source: "effective_restriction",
			usedLegacyAvailabilityStopSell: false,
			stopSell: false,
			minStay: 3,
			maxStay: 9,
			cta: true,
			ctd: false,
		})
	})

	it("encapsulates availability stopSell as explicit legacy compatibility only", () => {
		const result = resolveSearchSellability({
			restrictionRow: null,
			availabilityRow: {
				stopSell: true,
				availableUnits: 4,
			},
		})

		expect(result).toMatchObject({
			source: "availability_stop_sell_compatibility",
			usedLegacyAvailabilityStopSell: true,
			stopSell: true,
			minStay: null,
			cta: false,
			ctd: false,
		})
	})
})
