import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { productRepository } from "@/container"
import { buildTaxFeeWarnings, computeTaxBreakdown } from "@/modules/taxes-fees/public"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"
import { listTaxFeeAssignmentsByScopeUseCase } from "@/container/taxes-fees.container"
import type { TaxFeeDefinition } from "@/modules/taxes-fees/domain/tax-fee.types"

const schema = z.object({
	productId: z.string().min(1),
	base: z.coerce.number(),
	checkIn: z.string().optional().nullable(),
	checkOut: z.string().optional().nullable(),
	nights: z.coerce.number().int().min(1).optional(),
	guests: z.coerce.number().int().min(0).optional(),
	adults: z.coerce.number().int().min(0).optional(),
	children: z.coerce.number().int().min(0).optional(),
})

function parseISODate(value: string): Date | null {
	const d = new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

function calcNights(checkIn: Date, checkOut: Date): number {
	return Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000)
}

const VALID_APPLIES_PER = ["stay", "night", "guest", "guest_night"] as const
const VALID_CALC_TYPES = ["percentage", "fixed"] as const
const VALID_KINDS = ["tax", "fee"] as const
const VALID_INCLUSION = ["included", "excluded"] as const

function isValidDefinition(def: TaxFeeDefinition, now: Date): boolean {
	if (def.status !== "active") return false
	if (def.effectiveFrom && def.effectiveFrom > now) return false
	if (def.effectiveTo && def.effectiveTo < now) return false
	if (!VALID_KINDS.includes(def.kind)) return false
	if (!VALID_CALC_TYPES.includes(def.calculationType)) return false
	if (!VALID_INCLUSION.includes(def.inclusionType)) return false
	if (!VALID_APPLIES_PER.includes(def.appliesPer)) return false
	if (def.value <= 0) return false
	if (def.calculationType === "percentage" && def.currency) return false
	if (def.calculationType === "fixed" && !def.currency) return false
	return true
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = schema.parse({
			productId: form.get("productId"),
			base: form.get("base"),
			checkIn: form.get("checkIn"),
			checkOut: form.get("checkOut"),
			nights: form.get("nights") ?? undefined,
			guests: form.get("guests") ?? undefined,
			adults: form.get("adults") ?? undefined,
			children: form.get("children") ?? undefined,
		})

		let nights = parsed.nights ?? null
		if (!nights) {
			const checkIn = parsed.checkIn ? parseISODate(parsed.checkIn) : null
			const checkOut = parsed.checkOut ? parseISODate(parsed.checkOut) : null
			if (!checkIn || !checkOut || checkOut <= checkIn) {
				return new Response(
					JSON.stringify({ error: "validation_error", message: "Invalid dates" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				)
			}
			nights = calcNights(checkIn, checkOut)
		}

		const owned = await productRepository.ensureProductOwnedByProvider(parsed.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (nights <= 0) {
			return new Response(JSON.stringify({ error: "validation_error", message: "Invalid stay" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const guests = parsed.guests ?? Math.max(0, (parsed.adults ?? 0) + (parsed.children ?? 0)) ?? 1

		const resolved = await resolveEffectiveTaxFeesUseCase({
			providerId,
			productId: parsed.productId,
		})

		let definitions = resolved.definitions
		let usedFallback = false
		if (!definitions.length) {
			const fallback = await listTaxFeeAssignmentsByScopeUseCase({
				scope: "product",
				scopeId: parsed.productId,
			})
			const now = new Date()
			const mapped = fallback.assignments.map((a) => ({
				definition: a.definition,
				source: {
					scope: a.scope,
					scopeId: a.scopeId,
					definitionId: a.definition.id,
				},
			}))
			const filtered = mapped.filter((d) => isValidDefinition(d.definition, now))
			definitions = filtered.length ? filtered : mapped
			usedFallback = true
		}

		const warnings = buildTaxFeeWarnings(definitions.map((d) => d.definition))

		const breakdown = computeTaxBreakdown({
			base: parsed.base,
			definitions,
			nights,
			guests: guests || 1,
		})

		const hasIncluded = breakdown.taxes.included.length > 0 || breakdown.fees.included.length > 0
		const hasExcluded = breakdown.taxes.excluded.length > 0 || breakdown.fees.excluded.length > 0

		console.info("tax.preview", {
			productId: parsed.productId,
			base: parsed.base,
			nights,
			guests: guests || 1,
			definitions: definitions.length,
			warnings: warnings.length,
			fallback: usedFallback,
		})

		return new Response(
			JSON.stringify({
				breakdown,
				total: breakdown.total,
				flags: { hasIncluded, hasExcluded },
				warnings,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (err: any) {
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
}
