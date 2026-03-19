import type { PriceRule } from "./ratePlan.types"

export function applyPriceRules(basePrice: number, rules: PriceRule[], date: Date): number {
	let price = basePrice

	for (const rule of rules) {
		if (!rule.isActive) continue

		if (rule.startDate && date < new Date(rule.startDate)) continue
		if (rule.endDate && date > new Date(rule.endDate)) continue

		const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)

		switch (rule.type) {
			case "override":
				if (rule.value > 0) {
					price = rule.value
				}
				break
			case "percentage_discount":
				const discountVal = clamp(rule.value, 0, 100)
				price -= price * (discountVal / 100)
				break
			case "percentage_markup":
				const markupVal = Math.max(0, rule.value)
				price += price * (markupVal / 100)
				break
			case "fixed_adjustment":
				price += rule.value
				break
		}
		price = Math.max(0, price)
	}

	return price
}
