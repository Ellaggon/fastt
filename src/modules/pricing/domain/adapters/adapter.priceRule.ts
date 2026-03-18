import type { AppliedPriceRule } from "@/core/pricing/pricing.types"

export function adaptPriceRule(dbRule: any | null): AppliedPriceRule | null {
	if (!dbRule?.isActive) return null

	let type: "fixed" | "modifier" | "percentage" | null = null
	let value = Number(dbRule.value ?? 0)

	switch (dbRule.type) {
		case "override":
			type = "fixed"
			break

		case "fixed_adjustment":
			type = "modifier"
			break

		case "percentage_discount":
			type = "percentage"
			value = -Math.abs(value)
			break

		case "percentage_markup":
			type = "percentage"
			value = Math.abs(value)
			break

		default:
			return null
	}

	return {
		id: dbRule.id,
		rule: { type, value },
	}
}
