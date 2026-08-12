import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { productRepository } from "@/container"
import {
	db,
	eq,
	TaxFeeDefinition as TaxFeeDefinitionTable,
} from "@/shared/infrastructure/db/compat"
import {
	listTaxFeeAssignmentsByScopeUseCase,
	resolveEffectiveTaxFeesUseCase,
} from "@/container/taxes-fees.container"
import { buildTaxFeeWarnings, computeTaxBreakdown } from "@/modules/taxes-fees/public"
import type { TaxFeeDefinition } from "@/modules/taxes-fees/public"
import { buildPriceQuote } from "@/modules/pricing/public"

const schema = z.object({
	productId: z.string().min(1),
	taxFeeDefinitionId: z.string().min(1).optional().nullable(),
	variantId: z.string().min(1).optional().nullable(),
	ratePlanId: z.string().min(1).optional().nullable(),
	channel: z.string().min(1).optional().nullable(),
	country: z.string().trim().length(2).optional().nullable(),
	guestResidenceCountry: z.string().trim().length(2).optional().nullable(),
	base: z.coerce.number(),
	checkIn: z.string().optional().nullable(),
	checkOut: z.string().optional().nullable(),
	nights: z.coerce.number().int().min(1).optional(),
	guests: z.coerce.number().int().min(0).optional(),
	adults: z.coerce.number().int().min(0).optional(),
	children: z.coerce.number().int().min(0).optional(),
	rooms: z.coerce.number().int().min(1).optional().default(1),
	currency: z.string().trim().length(3).optional().default("USD"),
	childrenAges: z.string().optional().nullable(),
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
			taxFeeDefinitionId: form.get("taxFeeDefinitionId") || undefined,
			variantId: form.get("variantId") || undefined,
			ratePlanId: form.get("ratePlanId") || undefined,
			channel: form.get("channel") || undefined,
			country: form.get("country") || undefined,
			guestResidenceCountry: form.get("guestResidenceCountry") || undefined,
			base: form.get("base"),
			checkIn: form.get("checkIn"),
			checkOut: form.get("checkOut"),
			nights: form.get("nights") ?? undefined,
			guests: form.get("guests") ?? undefined,
			adults: form.get("adults") ?? undefined,
			children: form.get("children") ?? undefined,
			rooms: form.get("rooms") ?? undefined,
			currency: form.get("currency") ?? undefined,
			childrenAges: form.get("childrenAges") || undefined,
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
			variantId: parsed.variantId ?? undefined,
			ratePlanId: parsed.ratePlanId ?? undefined,
			channel: parsed.channel ?? "web",
		})

		let definitions = resolved.definitions
		if (parsed.taxFeeDefinitionId) {
			const selected = await db
				.select()
				.from(TaxFeeDefinitionTable)
				.where(eq(TaxFeeDefinitionTable.id, parsed.taxFeeDefinitionId))
				.then((rows) => rows[0] ?? null)
			if (!selected || selected.providerId !== providerId) {
				return new Response(JSON.stringify({ error: "not_found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				})
			}
			const selectedDefinition = {
				id: selected.id,
				providerId: selected.providerId,
				code: selected.code,
				name: selected.name,
				kind: selected.kind,
				calculationType: selected.calculationType,
				value: Number(selected.value),
				currency: selected.currency,
				inclusionType: selected.inclusionType,
				appliesPer: selected.appliesPer,
				priority: Number(selected.priority ?? 0),
				jurisdictionJson: selected.jurisdictionJson,
				effectiveFrom: selected.effectiveFrom,
				effectiveTo: selected.effectiveTo,
				// A draft is copied into this request only. The sales resolver never sees it.
				status: "active",
				editingState: selected.editingState ?? "published",
				currentVersionId: selected.currentVersionId ?? null,
				createdAt: selected.createdAt,
				updatedAt: selected.updatedAt,
			} as TaxFeeDefinition
			definitions = [
				...definitions.filter((item) => item.definition.id !== selectedDefinition.id),
				{
					definition: selectedDefinition,
					source: {
						scope: "product",
						scopeId: parsed.productId,
						definitionId: selectedDefinition.id,
					},
				},
			]
		}
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
			context: {
				country: parsed.country ?? null,
				guestResidenceCountry: parsed.guestResidenceCountry ?? null,
				checkIn: parsed.checkIn ?? null,
			},
		})

		const hasIncluded = breakdown.taxes.included.length > 0 || breakdown.fees.included.length > 0
		const hasExcluded = breakdown.taxes.excluded.length > 0 || breakdown.fees.excluded.length > 0
		const quote = buildPriceQuote({
			source: "simulation",
			context: {
				productId: parsed.productId,
				variantId: parsed.variantId ?? "simulation-variant",
				ratePlanId: parsed.ratePlanId ?? "simulation-rate-plan",
				checkIn: parsed.checkIn ?? new Date().toISOString().slice(0, 10),
				checkOut: parsed.checkOut ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10),
				rooms: parsed.rooms,
				occupancy: { adults: parsed.adults ?? guests, children: parsed.children ?? 0, infants: 0 },
				channel: parsed.channel ?? "web",
			},
			currency: parsed.currency,
			nights,
			baseAmount: parsed.base,
			taxesAndFees: breakdown,
			pricing: {
				days: Array.from({ length: nights }, (_, index) => ({
					date: new Date(
						(parsed.checkIn ? parseISODate(parsed.checkIn)! : new Date()).getTime() +
							index * 86400000
					)
						.toISOString()
						.slice(0, 10),
					price: Number((parsed.base / nights).toFixed(2)),
				})),
				source: "legacy",
			},
		})
		const appliedLines = [
			...breakdown.taxes.included,
			...breakdown.taxes.excluded,
			...breakdown.fees.included,
			...breakdown.fees.excluded,
		]
		const pendingAtProperty = appliedLines
			.filter(
				(line) => line.inclusionType === "excluded" && line.collectionResponsibility === "provider"
			)
			.reduce((sum, line) => sum + line.amount, 0)

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
				quote,
				breakdown,
				total: quote.totalAmount,
				settlement: {
					paidNow: Number((quote.totalAmount - pendingAtProperty).toFixed(2)),
					pendingAtProperty: Number(pendingAtProperty.toFixed(2)),
				},
				flags: { hasIncluded, hasExcluded },
				previewedDefinitionId: parsed.taxFeeDefinitionId ?? null,
				context: {
					productId: parsed.productId,
					variantId: parsed.variantId ?? null,
					ratePlanId: parsed.ratePlanId ?? null,
					channel: parsed.channel ?? "web",
					country: parsed.country ?? null,
					guestResidenceCountry: parsed.guestResidenceCountry ?? null,
				},
				warnings,
				technical: appliedLines.map((line) => ({
					definitionId: line.definitionId,
					definitionVersionId:
						definitions.find((item) => item.definition.id === line.definitionId)?.definition
							.currentVersionId ?? null,
					name: line.name,
					source: line.source,
					taxableBase: line.taxableBase,
					multiplier:
						line.appliesPer === "stay"
							? 1
							: line.appliesPer === "night"
								? nights
								: line.appliesPer === "guest"
									? guests
									: guests * nights,
					amount: line.amount,
					rounding: "half_up_2_decimals",
					channel: parsed.channel ?? "web",
				})),
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
