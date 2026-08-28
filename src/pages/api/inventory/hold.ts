import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import {
	and,
	db,
	EffectivePricing,
	eq,
	first,
	gte,
	lt,
	Product,
	Provider,
	SearchUnitView,
	TourSlotProfile,
} from "@/shared/infrastructure/db/compat"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { recordTourHold, toursCheckoutEnabled } from "@/lib/tours/tourObservability"
import {
	applyInventoryMutation,
	createInventoryHold,
	HOLD_COMMERCIAL_SNAPSHOT_VERSION,
} from "@/modules/inventory/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"
import { resolvePolicyExceptionRulesUseCase } from "@/container/policy-exceptions.container"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"
import { buildPriceQuote } from "@/modules/pricing/public"
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import { getProductTaxJurisdictionContext } from "@/lib/taxes-fees/jurisdiction-context"
import {
	buildOccupancyKey,
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
} from "@/modules/search/public"
import { toISODate } from "@/shared/domain/date/date.utils"
import { normalizeOccupancy } from "@/shared/domain/occupancy"
import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"

const schema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	rooms: z.number().int().min(1).default(1),
	occupancyDetail: z.object({
		adults: z.number().int().min(1),
		children: z.number().int().min(0).default(0),
		infants: z.number().int().min(0).default(0),
	}),
	sessionId: z.string().min(1).optional(),
	quoteId: z
		.string()
		.regex(/^pq_[a-f0-9]{32}$/)
		.optional(),
})

function optionalTrimmed(value: unknown): string | undefined {
	const s = String(value ?? "").trim()
	return s.length > 0 ? s : undefined
}

function isHttpsRequestUrl(request: Request): boolean {
	try {
		return new URL(request.url).protocol === "https:"
	} catch {
		return false
	}
}

function enumerateStayDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	while (cursor < end) {
		out.push(toISODate(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

type HoldabilityResult =
	| {
			holdable: true
			ratePlanId: string
			totalPrice: number
			nights: number
			days: Array<{
				date: string
				price: number
				pricingBreakdownV2?: {
					base: number
					occupancyAdjustment: number
					rules: number
					final: number
				}
				pricingSource: "v2"
			}>
	  }
	| {
			holdable: false
			reason: string
			failingDate: string | null
			debug: {
				variantId: string
				checkIn: string
				checkOut: string
				occupancyKey: string
			}
	  }

async function resolveHoldabilityFromView(params: {
	productId: string
	variantId: string
	ratePlanId: string
	checkIn: string
	checkOut: string
	occupancyDetail: { adults: number; children: number; infants: number }
	requestedRooms: number
}): Promise<HoldabilityResult> {
	const stayDates = enumerateStayDates(params.checkIn, params.checkOut)
	if (!stayDates.length) {
		return {
			holdable: false,
			reason: "INVALID_STAY_RANGE",
			failingDate: null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey: "",
			},
		}
	}

	const occupancyDetail = normalizeOccupancy(params.occupancyDetail)
	const occupancyKey = buildOccupancyKey(occupancyDetail)
	const predicates = [
		eq(SearchUnitView.productId, params.productId),
		eq(SearchUnitView.variantId, params.variantId),
		eq(SearchUnitView.occupancyKey, occupancyKey),
		gte(SearchUnitView.date, params.checkIn),
		lt(SearchUnitView.date, addDays(params.checkOut, 1)),
		eq(SearchUnitView.ratePlanId, params.ratePlanId),
	]
	const rows = await db
		.select({
			ratePlanId: SearchUnitView.ratePlanId,
			date: SearchUnitView.date,
			isAvailable: SearchUnitView.isAvailable,
			hasAvailability: SearchUnitView.hasAvailability,
			hasPrice: SearchUnitView.hasPrice,
			availableUnits: SearchUnitView.availableUnits,
			pricePerNight: SearchUnitView.pricePerNight,
			minStay: SearchUnitView.minStay,
			maxStay: SearchUnitView.maxStay,
			minLeadTime: SearchUnitView.minLeadTime,
			maxLeadTime: SearchUnitView.maxLeadTime,
			cta: SearchUnitView.cta,
			ctd: SearchUnitView.ctd,
			primaryBlocker: SearchUnitView.primaryBlocker,
		})
		.from(SearchUnitView)
		.innerJoin(Product, eq(Product.id, SearchUnitView.productId))
		.innerJoin(Provider, eq(Provider.id, Product.providerId))
		.where(
			and(
				...predicates,
				publicCatalogProductEligibility(),
				eq(Product.publicationState, "published")
			)
		)

	let v2Rows: Array<{
		variantId: string
		ratePlanId: string
		date: string
		finalBasePrice: number
		baseComponent: number
		occupancyAdjustment: number
		ruleAdjustment: number
	}> = []
	if (EffectivePricing && (EffectivePricing as any).variantId) {
		try {
			const effectivePricingRows = await db
				.select({
					variantId: EffectivePricing.variantId,
					ratePlanId: EffectivePricing.ratePlanId,
					date: EffectivePricing.date,
					finalBasePrice: EffectivePricing.finalBasePrice,
					baseComponent: EffectivePricing.baseComponent,
					occupancyAdjustment: EffectivePricing.occupancyAdjustment,
					ruleAdjustment: EffectivePricing.ruleAdjustment,
				})
				.from(EffectivePricing)
				.where(
					and(
						eq(EffectivePricing.variantId, params.variantId),
						eq(EffectivePricing.ratePlanId, params.ratePlanId),
						eq(EffectivePricing.occupancyKey, occupancyKey),
						gte(EffectivePricing.date, params.checkIn),
						lt(EffectivePricing.date, addDays(params.checkOut, 1))
					)
				)
			v2Rows = effectivePricingRows.map((row) => ({
				variantId: row.variantId,
				ratePlanId: row.ratePlanId,
				date: row.date,
				finalBasePrice: Number(row.finalBasePrice ?? 0),
				baseComponent: Number(row.baseComponent ?? 0),
				occupancyAdjustment: Number(row.occupancyAdjustment ?? 0),
				ruleAdjustment: Number(row.ruleAdjustment ?? 0),
			}))
		} catch {
			v2Rows = []
		}
	}
	const v2ByKey = new Map<
		string,
		{
			finalBasePrice: number
			base: number
			occupancyAdjustment: number
			rules: number
		}
	>()
	for (const row of v2Rows) {
		v2ByKey.set(`${String(row.variantId)}:${String(row.ratePlanId)}:${String(row.date)}`, {
			finalBasePrice: Number(row.finalBasePrice ?? 0),
			base: Number(row.baseComponent ?? 0),
			occupancyAdjustment: Number(row.occupancyAdjustment ?? 0),
			rules: Number(row.ruleAdjustment ?? 0),
		})
	}

	if (!rows.length) {
		return {
			holdable: false,
			reason: "RATEPLAN_CONTEXT_INVALID",
			failingDate: stayDates[0] ?? null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey,
			},
		}
	}

	const byRatePlan = new Map<string, typeof rows>()
	for (const row of rows) {
		const key = String(row.ratePlanId ?? "")
		if (!key) continue
		const bucket = byRatePlan.get(key) ?? []
		bucket.push(row)
		byRatePlan.set(key, bucket)
	}

	let firstFailure: { reason: string; failingDate: string | null } | null = null
	let selected: {
		ratePlanId: string
		totalPrice: number
		days: Array<{
			date: string
			price: number
			pricingBreakdownV2?: {
				base: number
				occupancyAdjustment: number
				rules: number
				final: number
			}
			pricingSource: "v2"
		}>
	} | null = null
	for (const [ratePlanId, bucket] of byRatePlan.entries()) {
		const byDate = new Map<string, SearchUnitViewStayRow>(
			bucket.map((row) => [
				String(row.date),
				{
					date: String(row.date),
					isAvailable: Boolean(row.isAvailable),
					hasAvailability: Boolean(row.hasAvailability),
					hasPrice: Boolean(row.hasPrice),
					availableUnits: Math.max(0, Number(row.availableUnits ?? 0)),
					minStay: row.minStay == null ? null : Number(row.minStay),
					maxStay: row.maxStay == null ? null : Number(row.maxStay),
					minLeadTime: row.minLeadTime == null ? null : Number(row.minLeadTime),
					maxLeadTime: row.maxLeadTime == null ? null : Number(row.maxLeadTime),
					cta: Boolean(row.cta),
					ctd: Boolean(row.ctd),
					primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
					pricePerNight:
						row.pricePerNight == null || !Number.isFinite(Number(row.pricePerNight))
							? null
							: Number(row.pricePerNight),
				},
			])
		)
		const evaluation = evaluateStaySellabilityFromView({
			stayDates,
			checkInDate: params.checkIn,
			requestedRooms: params.requestedRooms,
			rowsByDate: byDate,
		})
		if (!evaluation.isSellable) {
			const firstReasonCode = evaluation.reasonCodes[0] ?? "MISSING_COVERAGE"
			if (!firstFailure) {
				firstFailure = {
					reason: String(firstReasonCode),
					failingDate: stayDates[0] ?? null,
				}
			}
			continue
		}

		const days = stayDates.map((date) => {
			const key = `${params.variantId}:${ratePlanId}:${date}`
			const v2 = v2ByKey.get(key)
			if (v2 && Number.isFinite(v2.finalBasePrice)) {
				return {
					date,
					price: v2.finalBasePrice,
					pricingBreakdownV2: {
						base: Number(v2.base.toFixed(2)),
						occupancyAdjustment: Number(v2.occupancyAdjustment.toFixed(2)),
						rules: Number(v2.rules.toFixed(2)),
						final: Number(v2.finalBasePrice.toFixed(2)),
					},
					pricingSource: "v2" as const,
				}
			}
			return {
				date,
				price: Number.NaN,
				pricingSource: "v2" as const,
			}
		})
		if (days.some((day) => !Number.isFinite(day.price) || day.price <= 0)) {
			if (!firstFailure) {
				firstFailure = {
					reason: "MISSING_PRICE",
					failingDate:
						days.find((day) => !Number.isFinite(day.price) || day.price <= 0)?.date ?? null,
				}
			}
			continue
		}
		const totalPrice = days.reduce((sum, day) => sum + day.price, 0)
		if (!selected || totalPrice < selected.totalPrice) {
			selected = { ratePlanId, totalPrice, days }
		}
	}

	if (!selected) {
		return {
			holdable: false,
			reason: firstFailure?.reason ?? "UNKNOWN",
			failingDate: firstFailure?.failingDate ?? stayDates[0] ?? null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey,
			},
		}
	}

	return {
		holdable: true,
		ratePlanId: selected.ratePlanId,
		totalPrice: selected.totalPrice,
		nights: stayDates.length,
		days: selected.days,
	}
}

const GUEST_SESSION_COOKIE = "ft_guest_session_id"

export const POST: APIRoute = async ({ request, cookies }) => {
	const startedAt = performance.now()
	let tourHoldAttempt = false
	let tourMetricCtx:
		| { providerId: string | null; subject: { providerId: string | null; host: string | null } }
		| undefined
	try {
		const user = await getUserFromRequest(request)

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown
		let usedLegacyNumericOccupancy = false
		if (contentType.includes("application/json")) {
			const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
			const occupancyDetailFromRaw =
				(raw as any).occupancyDetail && typeof (raw as any).occupancyDetail === "object"
					? {
							adults: Number((raw as any).occupancyDetail.adults ?? 0),
							children: Number((raw as any).occupancyDetail.children ?? 0),
							infants: Number((raw as any).occupancyDetail.infants ?? 0),
						}
					: null
			const hasLegacyNumericOccupancy = raw.occupancy != null
			if (!occupancyDetailFromRaw && hasLegacyNumericOccupancy) usedLegacyNumericOccupancy = true
			payload = {
				variantId: String(raw.variantId ?? "").trim(),
				ratePlanId: optionalTrimmed((raw as any).ratePlanId),
				dateRange: {
					from: String((raw as any)?.dateRange?.from ?? raw.checkIn ?? raw.from ?? "").trim(),
					to: String((raw as any)?.dateRange?.to ?? raw.checkOut ?? raw.to ?? "").trim(),
				},
				rooms: Number(raw.rooms ?? raw.quantity ?? 1),
				occupancyDetail: occupancyDetailFromRaw,
				sessionId: optionalTrimmed(raw.sessionId ?? request.headers.get("x-session-id")),
				quoteId: optionalTrimmed(raw.quoteId),
			}
		} else {
			const form = await request.formData()
			const occupancyDetailAdultsRaw = form.get("occupancyDetail[adults]") ?? form.get("adults")
			const occupancyDetailChildrenRaw =
				form.get("occupancyDetail[children]") ?? form.get("children")
			const occupancyDetailInfantsRaw = form.get("occupancyDetail[infants]") ?? form.get("infants")
			const hasOccupancyDetailInForm = occupancyDetailAdultsRaw != null
			const hasLegacyNumericOccupancy = form.get("occupancy") != null
			if (!hasOccupancyDetailInForm && hasLegacyNumericOccupancy) usedLegacyNumericOccupancy = true
			payload = {
				variantId: String(form.get("variantId") ?? "").trim(),
				ratePlanId: optionalTrimmed(form.get("ratePlanId")),
				dateRange: {
					from: String(form.get("checkIn") ?? form.get("from") ?? "").trim(),
					to: String(form.get("checkOut") ?? form.get("to") ?? "").trim(),
				},
				rooms: Number(form.get("rooms") ?? form.get("quantity") ?? 1),
				occupancyDetail: hasOccupancyDetailInForm
					? {
							adults: Number(occupancyDetailAdultsRaw ?? 0),
							children: Number(occupancyDetailChildrenRaw ?? 0),
							infants: Number(occupancyDetailInfantsRaw ?? 0),
						}
					: null,
				sessionId: optionalTrimmed(form.get("sessionId")),
				quoteId: optionalTrimmed(form.get("quoteId")),
			}
		}
		if (usedLegacyNumericOccupancy) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [
						{
							path: ["occupancyDetail"],
							message: "occupancyDetail is required; numeric occupancy fallback was retired",
							code: "hold_legacy_numeric_occupancy_removed",
						},
					],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		const parsed = schema.parse(payload)
		const warnings: Array<{ code: string; severity: "warning" }> = []
		const cookieSessionId = String(cookies?.get?.(GUEST_SESSION_COOKIE)?.value ?? "").trim()
		let generatedGuestSessionId: string | null = null
		if (!cookieSessionId && !user?.id && !user?.email) {
			generatedGuestSessionId = crypto.randomUUID()
			cookies?.set?.(GUEST_SESSION_COOKIE, generatedGuestSessionId, {
				path: "/",
				maxAge: 60 * 60 * 24 * 180,
				sameSite: "lax",
				httpOnly: true,
				secure: isHttpsRequestUrl(request),
			})
		}
		const effectiveSessionId =
			String(parsed.sessionId ?? "").trim() ||
			String(request.headers.get("x-session-id") ?? "").trim() ||
			cookieSessionId ||
			String(generatedGuestSessionId ?? "").trim() ||
			String((user as any).id ?? "").trim() ||
			String(user?.email ?? "").trim()
		if (!effectiveSessionId) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["sessionId"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const result = await applyInventoryMutation({
			mutate: async () => {
				const variant = await variantManagementRepository.getVariantById(parsed.variantId)
				if (!variant?.productId) throw new Error("variant_not_found")

				const tourSlot = await db
					.select({
						departureTime: TourSlotProfile.departureTime,
						bookingMode: TourSlotProfile.bookingMode,
					})
					.from(TourSlotProfile)
					.where(eq(TourSlotProfile.variantId, parsed.variantId))
					.then(first)

				const isTourSlot = Boolean(tourSlot)
				tourHoldAttempt = isTourSlot
				const requestHost = (() => {
					try {
						return new URL(request.url).host
					} catch {
						return null
					}
				})()
				const providerId = await db
					.select({ providerId: Product.providerId })
					.from(Product)
					.where(eq(Product.id, variant.productId))
					.then(first)
					.then((row) => String(row?.providerId ?? "").trim() || null)
				tourMetricCtx = {
					providerId,
					subject: { providerId, host: requestHost },
				}
				// Env-only kill-switch + canary (staging → allowlist → % → general).
				if (
					isTourSlot &&
					!toursCheckoutEnabled({
						providerId,
						host: requestHost,
					})
				) {
					throw new Error("tours_checkout_disabled")
				}

				if (String(tourSlot?.bookingMode ?? "").toLowerCase() === "private") {
					recordTourHold("private_on_request", undefined, tourMetricCtx)
					const err = new Error("private_on_request")
					;(err as any).details = {
						bookingMode: "private",
						hint: "Use /api/tours/private-request — no inventory hold until provider accepts",
					}
					throw err
				}

				const holdability = await resolveHoldabilityFromView({
					productId: variant.productId,
					variantId: parsed.variantId,
					ratePlanId: parsed.ratePlanId,
					checkIn: parsed.dateRange.from,
					checkOut: parsed.dateRange.to,
					occupancyDetail: parsed.occupancyDetail,
					requestedRooms: parsed.rooms,
				})
				if (!holdability.holdable) {
					if (isTourSlot) {
						recordTourHold("not_holdable", String(holdability.reason ?? "UNKNOWN"), tourMetricCtx)
					}
					const err = new Error("not_holdable")
					;(err as any).details = holdability
					throw err
				}

				return createInventoryHold(
					{
						repo: inventoryHoldRepository,
						resolveEffectivePolicies: (ctx) => resolveEffectivePolicies(ctx),
						buildGuestExpectationsSnapshot: (productId, variantId) =>
							buildGuestStayExpectationsSnapshot(productId, { variantId }),
						resolvePolicyExceptionRules: (ctx) => resolvePolicyExceptionRulesUseCase(ctx),
						policyContext: {
							productId: variant.productId,
							ratePlanId: parsed.ratePlanId,
							channel: "web",
							departureTime: tourSlot?.departureTime ?? null,
							providerId,
							host: requestHost,
						},
						resolvePricingSnapshot: async ({ from, to }) => {
							if (from !== parsed.dateRange.from || to !== parsed.dateRange.to) return null
							const pricingBreakdownV2Totals = holdability.days.reduce(
								(acc, day) => {
									const breakdown = day.pricingBreakdownV2
									if (!breakdown) return acc
									return {
										base: acc.base + Number(breakdown.base ?? 0),
										occupancyAdjustment:
											acc.occupancyAdjustment + Number(breakdown.occupancyAdjustment ?? 0),
										rules: acc.rules + Number(breakdown.rules ?? 0),
										final: acc.final + Number(breakdown.final ?? day.price ?? 0),
									}
								},
								{ base: 0, occupancyAdjustment: 0, rules: 0, final: 0 }
							)
							const taxResolved = await resolveEffectiveTaxFeesUseCase({
								productId: variant.productId,
								variantId: parsed.variantId,
								ratePlanId: holdability.ratePlanId,
								channel: "web",
							})
							const taxBreakdown = computeTaxBreakdown({
								base: holdability.totalPrice,
								definitions: taxResolved.definitions,
								nights: holdability.nights,
								guests: Math.max(
									1,
									parsed.occupancyDetail.adults + parsed.occupancyDetail.children
								),
								context: {
									...(await getProductTaxJurisdictionContext(variant.productId)),
									checkIn: from,
								},
							})
							const priceQuote = buildPriceQuote({
								context: {
									productId: variant.productId,
									variantId: parsed.variantId,
									ratePlanId: holdability.ratePlanId,
									checkIn: from,
									checkOut: to,
									rooms: parsed.rooms,
									occupancy: parsed.occupancyDetail,
									channel: "web",
								},
								currency: "USD",
								nights: holdability.nights,
								baseAmount: holdability.totalPrice,
								taxesAndFees: taxBreakdown,
								pricing: {
									days: holdability.days,
									breakdownV2: {
										base: Number(pricingBreakdownV2Totals.base.toFixed(2)),
										occupancyAdjustment: Number(
											pricingBreakdownV2Totals.occupancyAdjustment.toFixed(2)
										),
										rules: Number(pricingBreakdownV2Totals.rules.toFixed(2)),
										final: Number(pricingBreakdownV2Totals.final.toFixed(2)),
									},
									source: "v2",
								},
							})
							if (parsed.quoteId && parsed.quoteId !== priceQuote.quoteId) {
								const error = new Error("price_changed")
								;(error as any).details = { priceQuote }
								throw error
							}
							return {
								version: HOLD_COMMERCIAL_SNAPSHOT_VERSION,
								ratePlanId: holdability.ratePlanId,
								currency: "USD",
								occupancy: Math.max(
									1,
									parsed.occupancyDetail.adults + parsed.occupancyDetail.children
								),
								occupancyDetail: parsed.occupancyDetail,
								rooms: parsed.rooms,
								from,
								to,
								nights: holdability.nights,
								totalPrice: priceQuote.totalAmount,
								days: holdability.days,
								priceQuote,
								pricingBreakdownV2: {
									base: Number(pricingBreakdownV2Totals.base.toFixed(2)),
									occupancyAdjustment: Number(
										pricingBreakdownV2Totals.occupancyAdjustment.toFixed(2)
									),
									rules: Number(pricingBreakdownV2Totals.rules.toFixed(2)),
									final: Number(pricingBreakdownV2Totals.final.toFixed(2)),
								},
								pricingSource: "v2",
							}
						},
					},
					{
						variantId: parsed.variantId,
						dateRange: parsed.dateRange,
						rooms: parsed.rooms,
						sessionId: effectiveSessionId,
					}
				)
			},
			recompute: (holdResult) => ({
				variantId: parsed.variantId,
				from: parsed.dateRange.from,
				to: parsed.dateRange.to,
				reason: "hold_create",
				idempotencyKey: `hold_create:${holdResult.holdId}`,
			}),
			logContext: {
				action: "hold_create",
				variantId: parsed.variantId,
				from: parsed.dateRange.from,
				to: parsed.dateRange.to,
			},
		})

		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (variant) {
			await invalidateVariant(parsed.variantId, variant.productId)
		}

		if (String(variant?.kind ?? "") === "tour_slot") {
			recordTourHold("success", undefined, tourMetricCtx)
		}

		console.debug("inventory_hold_created", {
			variantId: parsed.variantId,
			holdId: result.holdId,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		const boundPriceQuote = result.priceQuote

		if (parsed.quoteId && boundPriceQuote?.quoteId !== parsed.quoteId) {
			return new Response(
				JSON.stringify({
					error: "price_changed",
					priceQuote: boundPriceQuote,
				}),
				{ status: 409, headers: { "Content-Type": "application/json" } }
			)
		}

		return new Response(
			JSON.stringify({
				holdId: result.holdId,
				expiresAt: result.expiresAt.toISOString(),
				priceQuote: boundPriceQuote,
				warnings,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof Error && e.message === "tours_checkout_disabled") {
			recordTourHold("disabled", undefined, tourMetricCtx)
			return new Response(
				JSON.stringify({
					error: "tours_checkout_disabled",
					message: "Tour checkout is temporarily disabled.",
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message.startsWith("MISSING_POLICY_CATEGORY:")) {
			return new Response(
				JSON.stringify({
					error: "invalid_policy_context",
					reason: "MISSING_REQUIRED_POLICY_CATEGORY",
					details: e.message.replace("MISSING_POLICY_CATEGORY:", "").split(",").filter(Boolean),
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message === "not_available") {
			if (tourHoldAttempt) recordTourHold("not_holdable", "NO_CAPACITY", tourMetricCtx)
			return new Response(
				JSON.stringify({
					error: "not_holdable",
					reason: "NO_CAPACITY",
					failingDate: null,
					debug: null,
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message === "private_on_request") {
			return new Response(
				JSON.stringify({
					error: "private_on_request",
					message:
						"Esta salida es privada: solicita cotización. No se reserva inventario hasta aceptación del proveedor.",
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message === "not_holdable") {
			const details = (e as any).details as
				| {
						reason?: string
						failingDate?: string | null
						debug?: Record<string, unknown>
				  }
				| undefined
			return new Response(
				JSON.stringify({
					error: "not_holdable",
					reason: String(details?.reason ?? "UNKNOWN"),
					failingDate: details?.failingDate ?? null,
					debug: details?.debug ?? null,
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message === "price_changed") {
			return new Response(JSON.stringify({ error: "price_changed", ...(e as any).details }), {
				status: 409,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		if (tourHoldAttempt) recordTourHold("failure", msg, tourMetricCtx)
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
