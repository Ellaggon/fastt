import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { and, db, EffectivePricingV2, eq, gte, lt, SearchUnitView } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { applyInventoryMutation, createInventoryHold } from "@/modules/inventory/public"
import {
	normalizePolicyResolutionResult,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { resolveEffectiveRules } from "@/modules/rules/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"
import {
	buildOccupancyKey,
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
} from "@/modules/search/public"
import { toISODate } from "@/shared/domain/date/date.utils"
import { normalizeOccupancy } from "@/shared/domain/occupancy"

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
			isSellable: SearchUnitView.isSellable,
			isAvailable: SearchUnitView.isAvailable,
			hasAvailability: SearchUnitView.hasAvailability,
			hasPrice: SearchUnitView.hasPrice,
			stopSell: SearchUnitView.stopSell,
			availableUnits: SearchUnitView.availableUnits,
			pricePerNight: SearchUnitView.pricePerNight,
			minStay: SearchUnitView.minStay,
			cta: SearchUnitView.cta,
			ctd: SearchUnitView.ctd,
			primaryBlocker: SearchUnitView.primaryBlocker,
		})
		.from(SearchUnitView)
		.where(and(...predicates))
		.all()
	let v2Rows: Array<{
		variantId: string
		ratePlanId: string
		date: string
		finalBasePrice: number
		baseComponent: number
		occupancyAdjustment: number
		ruleAdjustment: number
	}> = []
	if (EffectivePricingV2 && (EffectivePricingV2 as any).variantId) {
		try {
			v2Rows = await db
				.select({
					variantId: EffectivePricingV2.variantId,
					ratePlanId: EffectivePricingV2.ratePlanId,
					date: EffectivePricingV2.date,
					finalBasePrice: EffectivePricingV2.finalBasePrice,
					baseComponent: EffectivePricingV2.baseComponent,
					occupancyAdjustment: EffectivePricingV2.occupancyAdjustment,
					ruleAdjustment: EffectivePricingV2.ruleAdjustment,
				})
				.from(EffectivePricingV2)
				.where(
					and(
						eq(EffectivePricingV2.variantId, params.variantId),
						eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
						eq(EffectivePricingV2.occupancyKey, occupancyKey),
						gte(EffectivePricingV2.date, params.checkIn),
						lt(EffectivePricingV2.date, addDays(params.checkOut, 1))
					)
				)
				.all()
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
					isSellable: Boolean(row.isSellable),
					isAvailable: Boolean(row.isAvailable),
					hasAvailability: Boolean(row.hasAvailability),
					hasPrice: Boolean(row.hasPrice),
					stopSell: Boolean(row.stopSell),
					availableUnits: Math.max(0, Number(row.availableUnits ?? 0)),
					minStay: row.minStay == null ? null : Number(row.minStay),
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
			const hasLegacyNumericOccupancy = raw.occupancy != null || raw.quantity != null
			if (!occupancyDetailFromRaw && hasLegacyNumericOccupancy) usedLegacyNumericOccupancy = true
			payload = {
				variantId: String(raw.variantId ?? "").trim(),
				ratePlanId: optionalTrimmed((raw as any).ratePlanId),
				dateRange: {
					from: String((raw as any)?.dateRange?.from ?? raw.checkIn ?? raw.from ?? "").trim(),
					to: String((raw as any)?.dateRange?.to ?? raw.checkOut ?? raw.to ?? "").trim(),
				},
				rooms: Number(raw.rooms ?? raw.quantity ?? 1),
				occupancyDetail:
					occupancyDetailFromRaw ??
					(hasLegacyNumericOccupancy
						? {
								adults: Number(raw.occupancy ?? raw.quantity ?? 1),
								children: 0,
								infants: 0,
							}
						: null),
				sessionId: optionalTrimmed(raw.sessionId ?? request.headers.get("x-session-id")),
			}
		} else {
			const form = await request.formData()
			const occupancyDetailAdultsRaw = form.get("occupancyDetail[adults]") ?? form.get("adults")
			const occupancyDetailChildrenRaw =
				form.get("occupancyDetail[children]") ?? form.get("children")
			const occupancyDetailInfantsRaw = form.get("occupancyDetail[infants]") ?? form.get("infants")
			const hasOccupancyDetailInForm = occupancyDetailAdultsRaw != null
			const hasLegacyNumericOccupancy =
				form.get("occupancy") != null || form.get("quantity") != null
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
					: hasLegacyNumericOccupancy
						? {
								adults: Number(form.get("occupancy") ?? form.get("quantity") ?? 1),
								children: 0,
								infants: 0,
							}
						: null,
				sessionId: optionalTrimmed(form.get("sessionId")),
			}
		}
		const parsed = schema.parse(payload)
		const warnings = usedLegacyNumericOccupancy
			? [{ code: "hold_legacy_numeric_occupancy_used", severity: "warning" as const }]
			: []
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
					const err = new Error("not_holdable")
					;(err as any).details = holdability
					throw err
				}

				return createInventoryHold(
					{
						repo: inventoryHoldRepository,
						resolveEffectivePolicies: async (ctx) =>
							normalizePolicyResolutionResult(await resolveEffectivePolicies(ctx), {
								asOfDate: String(ctx.checkIn ?? new Date().toISOString().slice(0, 10)),
								warnings: [],
							}).dto,
						resolveEffectiveRules: (ctx) => resolveEffectiveRules(ctx),
						policyContext: {
							productId: variant.productId,
							ratePlanId: parsed.ratePlanId,
							channel: "web",
						},
						resolvePricingSnapshot: async ({ from, to, occupancy }) => {
							if (from !== parsed.dateRange.from || to !== parsed.dateRange.to) return null
							if (occupancy !== parsed.rooms) return null
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
							return {
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
								totalPrice: holdability.totalPrice,
								days: holdability.days,
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
						occupancy: parsed.rooms,
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

		console.debug("inventory_hold_created", {
			variantId: parsed.variantId,
			holdId: result.holdId,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		return new Response(
			JSON.stringify({
				holdId: result.holdId,
				expiresAt: result.expiresAt.toISOString(),
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
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
