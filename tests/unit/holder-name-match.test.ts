import { describe, expect, it } from "vitest"

import { assessHolderNameMatch } from "@/lib/compliance/holder-name-match"

describe("assessHolderNameMatch", () => {
	it("treats accents, ordering and legal forms as an exact normalized match", () => {
		const result = assessHolderNameMatch({
			legalName: "Aventuras del Sur S.R.L.",
			accountHolderName: "SUR AVENTURAS DEL S.R.L.",
		})
		expect(result.level).toBe("exact")
		expect(result.score).toBe(1)
	})

	it("keeps a near typo as probable instead of silently accepting it", () => {
		const result = assessHolderNameMatch({
			legalName: "Aventuras del Sur S.R.L.",
			accountHolderName: "Aventuras del Surr SRL",
		})
		expect(result.level).toBe("probable")
		expect(result.score).toBeLessThan(1)
	})

	it("rejects unrelated holders and fails closed when a name is missing", () => {
		expect(
			assessHolderNameMatch({
				legalName: "Aventuras del Sur S.R.L.",
				accountHolderName: "Banco Ejemplo",
			})
		).toMatchObject({ level: "mismatch" })
		expect(
			assessHolderNameMatch({ legalName: "", accountHolderName: "Banco Ejemplo" })
		).toMatchObject({
			level: "insufficient",
		})
	})
})
