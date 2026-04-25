import { db, EffectiveAvailability, EffectivePricing, EffectiveRestriction } from "astro:db"
import { describe, expect, it } from "vitest"

import {
	materializeSearchUnitRange,
	NewSearchPipelineAdapter,
	ReasonCode,
	type SearchOffersInput,
	type SearchSellabilityDTO,
	CanonicalSearchAdapter,
} from "@/modules/search/public"
import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"
import { assignPolicyCapa6, createPolicyCapa6 } from "@/modules/policies/public"
import { GET as getSearchDecision } from "@/pages/api/internal/observability/search-decision"
import { GET as getSearchShadowSummary } from "@/pages/api/internal/observability/search-shadow-summary"
import { searchOffers } from "@/container"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type Profile =
	| "baseline"
	| "no_inventory"
	| "cta_restriction"
	| "ctd_restriction"
	| "missing_price"
	| "policy_incomplete"

type HotelSeed = {
	productId: string
	variantId: string
	ratePlanId: string
	profile: Profile
}

type SyntheticQuery = {
	productId: string
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
	rooms: number
	currency: string
}

type StageReport = {
	runIndex: number
	requests: number
	summary: any
	decision: any
	anomalies: {
		criticalWithoutReason: number
		priceMismatchAboveThreshold: number
		invalidReasonCodes: number
		conflictingReasonCodes: number
		examples: Array<Record<string, unknown>>
	}
}

const START_DATE = "2026-10-01"
const DAYS = 45
const HOTELS_PER_PROFILE = 3
const VALIDATION_RUNS = 4
const REQUESTS_PER_STAGE = 350
const PRICE_MISMATCH_ALERT_THRESHOLD = 0.2
const BASE_SEED = Number(process.env.SEARCH_SYNTHETIC_BASE_SEED ?? 20260423)

function toISODate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
	const cursor = new Date(`${date}T00:00:00.000Z`)
	cursor.setUTCDate(cursor.getUTCDate() + days)
	return toISODate(cursor)
}

function dateRange(from: string, days: number): string[] {
	const out: string[] = []
	for (let i = 0; i < days; i += 1) out.push(addDays(from, i))
	return out
}

function createSeededRng(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x1_0000_0000
	}
}

function randomInt(rng: () => number, min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min
}

function pick<T>(rng: () => number, items: T[]): T {
	return items[Math.floor(rng() * items.length)]
}

function resetMetricsWindow(): void {
	const g = globalThis as unknown as { __appMetricsState?: unknown }
	delete g.__appMetricsState
}

async function parseJsonResponse(response: Response): Promise<any> {
	const text = await response.text()
	return text ? JSON.parse(text) : {}
}

function isValidReasonCode(reasonCode: string): boolean {
	return Object.values(ReasonCode).includes(reasonCode as ReasonCode)
}

function extractDecisionSummary(dto: SearchSellabilityDTO | undefined): {
	isSellable: boolean
	reasonCodes: string[]
	displayAmount: number | null
} {
	return {
		isSellable: Boolean(dto?.isSellable),
		reasonCodes: Array.isArray(dto?.reasonCodes) ? dto.reasonCodes.map(String) : [],
		displayAmount:
			dto?.price?.display?.amount != null && Number.isFinite(Number(dto.price.display.amount))
				? Number(dto.price.display.amount)
				: null,
	}
}

async function seedPoliciesForRatePlan(ratePlanId: string): Promise<void> {
	const policies = await createReusablePolicies()
	for (const policy of policies) {
		await assignPolicyCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel: "web",
		})
	}
}

let cachedReusablePolicies: Array<{ policyId: string }> | null = null

async function createReusablePolicies(): Promise<Array<{ policyId: string }>> {
	if (cachedReusablePolicies) return cachedReusablePolicies

	const cancellation = await createPolicyCapa6({
		category: "Cancellation",
		description: "Synthetic cancellation",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2027-12-31",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	} as any)
	const payment = await createPolicyCapa6({
		category: "Payment",
		description: "Synthetic payment",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2027-12-31",
		rules: { paymentType: "prepaid" },
	} as any)
	const checkIn = await createPolicyCapa6({
		category: "CheckIn",
		description: "Synthetic check-in",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2027-12-31",
		rules: { checkInFrom: "15:00", checkInUntil: "23:59", checkOutUntil: "11:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		category: "NoShow",
		description: "Synthetic no-show",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2027-12-31",
		rules: { penaltyType: "first_night" },
	} as any)

	cachedReusablePolicies = [cancellation, payment, checkIn, noShow]
	return cachedReusablePolicies
}

async function seedSyntheticHotels(): Promise<HotelSeed[]> {
	const providerId = `prov_synth_${crypto.randomUUID()}`
	const destinationId = `dest_synth_${crypto.randomUUID()}`
	await upsertProvider({
		id: providerId,
		displayName: "Synthetic Provider",
		ownerEmail: "synthetic-search@example.com",
	})
	await upsertDestination({
		id: destinationId,
		name: "Synthetic City",
		type: "city",
		country: "CL",
		slug: `synthetic-${destinationId}`,
	})

	const profiles: Profile[] = [
		"baseline",
		"no_inventory",
		"cta_restriction",
		"ctd_restriction",
		"missing_price",
		"policy_incomplete",
	]
	const dates = dateRange(START_DATE, DAYS)
	const seeded: HotelSeed[] = []
	let index = 0

	for (const profile of profiles) {
		for (let i = 0; i < HOTELS_PER_PROFILE; i += 1) {
			const productId = `prod_synth_${profile}_${index}_${crypto.randomUUID()}`
			const variantId = `var_synth_${profile}_${index}_${crypto.randomUUID()}`
			const templateId = `rpt_synth_${profile}_${index}_${crypto.randomUUID()}`
			const ratePlanId = `rp_synth_${profile}_${index}_${crypto.randomUUID()}`
			await upsertProduct({
				id: productId,
				name: `Synthetic Hotel ${profile} ${i + 1}`,
				productType: "Hotel",
				destinationId,
				providerId,
			})
			await upsertVariant({
				id: variantId,
				productId,
				kind: "hotel_room",
				name: `Room ${profile} ${i + 1}`,
				baseRateCurrency: "USD",
				baseRatePrice: 120 + i,
				isActive: true,
				minOccupancy: 1,
				maxOccupancy: 5,
			})
			await upsertRatePlanTemplate({
				id: templateId,
				name: `Template ${profile} ${i + 1}`,
				paymentType: "prepaid",
				refundable: false,
			})
			await upsertRatePlan({
				id: ratePlanId,
				templateId,
				variantId,
				isActive: true,
				isDefault: true,
			})

			if (profile !== "policy_incomplete") {
				await seedPoliciesForRatePlan(ratePlanId)
			}

			for (let d = 0; d < dates.length; d += 1) {
				const date = dates[d]
				const basePrice = 120 + (index % 11) + (d % 9)
				const availableUnits = profile === "no_inventory" ? 0 : 4
				const hasPricing = !(profile === "missing_price" && d % 4 === 0)

				await db
					.insert(EffectiveAvailability)
					.values({
						id: `ea_synth_${variantId}_${date}`,
						variantId,
						date,
						totalUnits: 4,
						heldUnits: 0,
						bookedUnits: profile === "no_inventory" ? 4 : 0,
						availableUnits,
						stopSell: false,
						isSellable: availableUnits > 0,
						computedAt: new Date(),
					} as any)
					.onConflictDoUpdate({
						target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
						set: {
							totalUnits: 4,
							heldUnits: 0,
							bookedUnits: profile === "no_inventory" ? 4 : 0,
							availableUnits,
							stopSell: false,
							isSellable: availableUnits > 0,
							computedAt: new Date(),
						},
					})

				await db
					.insert(EffectiveRestriction)
					.values({
						id: `er_synth_${variantId}_${date}`,
						variantId,
						date,
						stopSell: false,
						minStay: 1,
						cta: profile === "cta_restriction",
						ctd: profile === "ctd_restriction",
						computedAt: new Date(),
					} as any)
					.onConflictDoUpdate({
						target: [EffectiveRestriction.variantId, EffectiveRestriction.date],
						set: {
							stopSell: false,
							minStay: 1,
							cta: profile === "cta_restriction",
							ctd: profile === "ctd_restriction",
							computedAt: new Date(),
						},
					})

				if (hasPricing) {
					await db
						.insert(EffectivePricing)
						.values({
							id: `ep_synth_${variantId}_${ratePlanId}_${date}`,
							variantId,
							ratePlanId,
							date,
							basePrice,
							finalBasePrice: basePrice,
							yieldMultiplier: 1,
							computedAt: new Date(),
						} as any)
						.onConflictDoUpdate({
							target: [
								EffectivePricing.variantId,
								EffectivePricing.ratePlanId,
								EffectivePricing.date,
							],
							set: {
								basePrice,
								finalBasePrice: basePrice,
								yieldMultiplier: 1,
								computedAt: new Date(),
							},
						})
				}
			}

			seeded.push({ productId, variantId, ratePlanId, profile })
			index += 1
		}
	}

	const previousPolicyFlag = process.env.SEARCH_POLICY_BLOCKER_ENABLED
	process.env.SEARCH_POLICY_BLOCKER_ENABLED = "true"
	try {
		for (const seed of seeded) {
			await materializeSearchUnitRange({
				variantId: seed.variantId,
				ratePlanId: seed.ratePlanId,
				from: START_DATE,
				to: addDays(START_DATE, DAYS),
				currency: "USD",
			})
		}
	} finally {
		if (previousPolicyFlag == null) delete process.env.SEARCH_POLICY_BLOCKER_ENABLED
		else process.env.SEARCH_POLICY_BLOCKER_ENABLED = previousPolicyFlag
	}

	return seeded
}

function buildSyntheticQuery(params: { rng: () => number; hotels: HotelSeed }): SyntheticQuery {
	const nights = randomInt(params.rng, 1, 14)
	const fromOffset = randomInt(params.rng, 0, DAYS - 16)
	const checkInDate = addDays(START_DATE, fromOffset)
	const checkOutDate = addDays(checkInDate, nights)
	const withChildren = params.rng() < 0.25
	const children = withChildren ? randomInt(params.rng, 1, 2) : 0
	const adults = Math.max(1, Math.min(5 - children, randomInt(params.rng, 1, 4)))

	return {
		productId: params.hotels.productId,
		checkIn: new Date(`${checkInDate}T00:00:00.000Z`),
		checkOut: new Date(`${checkOutDate}T00:00:00.000Z`),
		adults,
		children,
		rooms: 1,
		currency: "USD",
	}
}

async function runStage(params: {
	runIndex: number
	requests: number
	seed: number
	hotels: HotelSeed[]
}): Promise<StageReport> {
	resetMetricsWindow()
	const rng = createSeededRng(params.seed)
	const repo = new SearchOffersRepository()
	const canonical = new CanonicalSearchAdapter(repo)
	const candidate = new NewSearchPipelineAdapter(repo)

	let criticalWithoutReason = 0
	let priceMismatchAboveThreshold = 0
	let invalidReasonCodes = 0
	let conflictingReasonCodes = 0
	const examples: Array<Record<string, unknown>> = []

	for (let i = 0; i < params.requests; i += 1) {
		const hotel = pick(rng, params.hotels)
		const query = buildSyntheticQuery({ rng, hotels: hotel })
		const requestId = `synthetic-run${params.runIndex}-${i}`
		await searchOffers({
			...query,
			featureContext: {
				requestId,
				env: {
					SEARCH_SHADOW_COMPARE: "true",
					SEARCH_SHADOW_SAMPLING_RATE: "1",
					SEARCH_POLICY_BLOCKER_ENABLED: "true",
				},
			},
		})

		if (i % 3 !== 0) continue
		const canonicalInput: SearchOffersInput = { ...query }
		const [legacyResult, newResult] = await Promise.all([
			canonical.run(canonicalInput),
			candidate.run(canonicalInput),
		])
		const keys = new Set([
			...Object.keys(legacyResult.sellabilityByRatePlan),
			...Object.keys(newResult.sellabilityByRatePlan),
		])

		for (const key of keys) {
			const legacyDecision = extractDecisionSummary(legacyResult.sellabilityByRatePlan[key])
			const candidateDecision = extractDecisionSummary(newResult.sellabilityByRatePlan[key])
			const legacyReason = legacyDecision.reasonCodes[0] ?? "NONE"
			const candidateReason = candidateDecision.reasonCodes[0] ?? "NONE"
			if (
				!candidateDecision.isSellable &&
				legacyDecision.isSellable &&
				candidateDecision.reasonCodes.length === 0
			) {
				criticalWithoutReason += 1
				if (examples.length < 12) {
					examples.push({
						type: "critical_without_reason",
						decisionKey: key,
						productId: query.productId,
						nights: Math.ceil((query.checkOut.getTime() - query.checkIn.getTime()) / 86_400_000),
						adults: query.adults,
						children: query.children,
						legacyReason,
						candidateReason,
					})
				}
			}

			for (const reasonCode of candidateDecision.reasonCodes) {
				if (!isValidReasonCode(reasonCode)) {
					invalidReasonCodes += 1
					if (examples.length < 12) {
						examples.push({
							type: "invalid_reason_code",
							decisionKey: key,
							productId: query.productId,
							reasonCode,
						})
					}
				}
			}

			if (
				!legacyDecision.isSellable &&
				!candidateDecision.isSellable &&
				legacyReason !== candidateReason
			) {
				conflictingReasonCodes += 1
			}

			const legacyPrice = legacyDecision.displayAmount
			const candidatePrice = candidateDecision.displayAmount
			if (
				legacyDecision.isSellable &&
				candidateDecision.isSellable &&
				legacyPrice != null &&
				candidatePrice != null &&
				legacyPrice > 0
			) {
				const ratio = Math.abs(candidatePrice - legacyPrice) / legacyPrice
				if (ratio > PRICE_MISMATCH_ALERT_THRESHOLD) {
					priceMismatchAboveThreshold += 1
					if (examples.length < 12) {
						examples.push({
							type: "price_mismatch_above_threshold",
							decisionKey: key,
							productId: query.productId,
							legacyPrice,
							candidatePrice,
							deltaRatio: Number(ratio.toFixed(4)),
						})
					}
				}
			}
		}
	}

	const shadowSummaryResponse = await getSearchShadowSummary({} as never)
	const decisionResponse = await getSearchDecision({
		request: new Request("http://localhost:4321/api/internal/observability/search-decision"),
		url: new URL("http://localhost:4321/api/internal/observability/search-decision"),
	} as any)
	const summaryJson = await parseJsonResponse(shadowSummaryResponse)
	const decisionJson = await parseJsonResponse(decisionResponse)

	return {
		runIndex: params.runIndex,
		requests: params.requests,
		summary: summaryJson,
		decision: decisionJson,
		anomalies: {
			criticalWithoutReason,
			priceMismatchAboveThreshold,
			invalidReasonCodes,
			conflictingReasonCodes,
			examples,
		},
	}
}

describe("search synthetic preprod validation (phase 2c without real traffic)", () => {
	it("generates reproducible synthetic traffic, validates mismatch signal, and emits migration readiness", async () => {
		const originalInfo = console.info
		const originalDebug = console.debug
		const originalWarn = console.warn
		console.info = () => {}
		console.debug = () => {}
		console.warn = () => {}

		try {
			const hotels = await seedSyntheticHotels()
			expect(hotels.length).toBeGreaterThan(0)

			const stageReports: StageReport[] = []
			for (let i = 0; i < VALIDATION_RUNS; i += 1) {
				const report = await runStage({
					runIndex: i + 1,
					requests: REQUESTS_PER_STAGE,
					seed: BASE_SEED + i * 17,
					hotels,
				})
				stageReports.push(report)
			}

			const totalRequests = stageReports.reduce((sum, stage) => sum + stage.requests, 0)
			const maxCriticalRatePct = stageReports.reduce(
				(max, stage) =>
					Math.max(
						max,
						(Number(stage.summary?.mismatchByType?.critical?.total ?? 0) * 100) /
							Math.max(1, Number(stage.summary?.mismatchRateGlobal?.totalComparisons ?? 0))
					),
				0
			)
			const maxSellableRatePct = stageReports.reduce(
				(max, stage) =>
					Math.max(max, Number(stage.summary?.mismatchRateGlobal?.rates?.sellable ?? 0)),
				0
			)
			const criticalAnomalies = stageReports.reduce(
				(sum, stage) =>
					sum + stage.anomalies.criticalWithoutReason + stage.anomalies.invalidReasonCodes,
				0
			)
			const latest = stageReports[stageReports.length - 1]
			const ready = String(latest?.decision?.status ?? "") === "healthy" && criticalAnomalies === 0

			console.log(
				JSON.stringify(
					{
						reportType: "search_synthetic_preprod_phase2c",
						baseSeed: BASE_SEED,
						totalRequests,
						runs: stageReports.map((stage) => ({
							runIndex: stage.runIndex,
							requests: stage.requests,
							mismatchRates: stage.summary?.mismatchRateGlobal?.rates ?? null,
							mismatchByType: stage.summary?.mismatchByType ?? null,
							shadow: stage.summary?.shadow ?? null,
							health: stage.decision?.health ?? null,
							status: stage.decision?.status ?? null,
							anomalies: stage.anomalies,
						})),
						aggregatedAnomalies: {
							criticalWithoutReason: stageReports.reduce(
								(sum, stage) => sum + stage.anomalies.criticalWithoutReason,
								0
							),
							priceMismatchAboveThreshold: stageReports.reduce(
								(sum, stage) => sum + stage.anomalies.priceMismatchAboveThreshold,
								0
							),
							invalidReasonCodes: stageReports.reduce(
								(sum, stage) => sum + stage.anomalies.invalidReasonCodes,
								0
							),
							conflictingReasonCodes: stageReports.reduce(
								(sum, stage) => sum + stage.anomalies.conflictingReasonCodes,
								0
							),
						},
						readiness: { ready, status: latest?.decision?.status ?? "unknown" },
					},
					null,
					2
				)
			)

			expect(totalRequests).toBeGreaterThanOrEqual(1000)
			expect(totalRequests).toBeLessThanOrEqual(5000)
			expect(maxCriticalRatePct).toBeLessThan(0.5)
			expect(maxSellableRatePct).toBeLessThan(1)
			expect(criticalAnomalies).toBe(0)
		} finally {
			console.info = originalInfo
			console.debug = originalDebug
			console.warn = originalWarn
		}
	}, 180_000)
})
