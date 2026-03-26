import { ZodError } from "zod"

import type { MinimalPriceRule } from "./computeBasePriceWithRules"

export type StrictDbRule = { id: string; type: string; value: number }

/**
 * CAPA 4B/C/D strict rule model:
 * - Allowed types ONLY: "percentage" | "fixed"
 * - percentage bounds: [-100, 1000]
 * - fixed bounds: >= -basePrice
 *
 * IMPORTANT: This function is the shared normalization/validation used by:
 * - pricing preview API
 * - search pricing computation
 *
 * This ensures identical rule semantics across the system.
 */
export function parseStrictMinimalRules(params: {
	basePrice: number
	rules: StrictDbRule[]
}): MinimalPriceRule[] {
	const out: MinimalPriceRule[] = []

	for (let i = 0; i < params.rules.length; i++) {
		const r = params.rules[i]
		const type = String(r.type)
		const value = Number(r.value)

		if (type !== "percentage" && type !== "fixed") {
			throw new ZodError([
				{
					code: "custom",
					path: ["rules", i, "type"],
					message: `Unsupported rule type: ${type}`,
				},
			])
		}

		if (Number.isNaN(value)) {
			throw new ZodError([
				{ code: "custom", path: ["rules", i, "value"], message: "Invalid rule value" },
			])
		}

		if (type === "percentage") {
			if (value < -100 || value > 1000) {
				throw new ZodError([
					{
						code: "custom",
						path: ["rules", i, "value"],
						message: "Percentage rule out of bounds (-100 to 1000)",
					},
				])
			}
		}

		if (type === "fixed") {
			if (value < -params.basePrice) {
				throw new ZodError([
					{
						code: "custom",
						path: ["rules", i, "value"],
						message: "Fixed rule too low for base price",
					},
				])
			}
		}

		out.push({ id: r.id, type: type as "percentage" | "fixed", value })
	}

	return out
}
