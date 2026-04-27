import {
	and,
	db,
	eq,
	EffectiveAvailability,
	EffectivePricing,
	gte,
	lt,
	SearchUnitView,
	sql,
} from "astro:db"

import { searchOffers } from "@/container"
import { GET as getCoverage } from "@/pages/api/internal/search/coverage"
import { buildOccupancyKey, materializeSearchUnitRange } from "@/modules/search/public"
import { readCounter, readTimingQuantile } from "@/lib/observability/metrics"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../../tests/test-support/catalog-db-test-data"

type VariantSeed = {
	productId: string
	variantId: string
	ratePlanId: string
	profile: "high" | "low" | "none"
}

const START_DATE = "2026-06-01"
const DAYS = 120
const OCCUPANCIES = [1, 2, 3, 4]
const PRODUCTS = 30
const VARIANTS_PER_PRODUCT = 3
const STRESS_QUERIES = 800
const STRESS_CONCURRENCY = 120

function toISODate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return toISODate(d)
}

function dateRange(from: string, days: number): string[] {
	const out: string[] = []
	for (let i = 0; i < days; i += 1) out.push(addDays(from, i))
	return out
}

function randInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(items: T[]): T {
	return items[randInt(0, items.length - 1)]
}

function profileFor(index: number): VariantSeed["profile"] {
	if (index % 7 === 0) return "none"
	if (index % 3 === 0) return "low"
	return "high"
}

function expectedSellableForStay(params: {
	profile: VariantSeed["profile"]
	fromOffset: number
	nights: number
	rooms: number
}): boolean {
	if (params.profile === "none") return false
	for (let i = 0; i < params.nights; i += 1) {
		const day = params.fromOffset + i
		let available = 0
		if (params.profile === "high") {
			available = 8 + (day % 3)
		} else if (params.profile === "low") {
			available = day % 2 === 0 ? 1 : 2
		}
		if (available < params.rooms) return false
	}
	return true
}

async function seedDataset(): Promise<{
	variants: VariantSeed[]
	products: string[]
}> {
	const providerId = `prov_sim_${crypto.randomUUID()}`
	await upsertProvider({
		id: providerId,
		displayName: "Provider Sim",
		ownerEmail: "sim-search@example.com",
	})

	const destinationId = `dest_sim_${crypto.randomUUID()}`
	await upsertDestination({
		id: destinationId,
		name: "Simulation City",
		type: "city",
		country: "CL",
		slug: `sim-${destinationId}`,
	})

	const dates = dateRange(START_DATE, DAYS)
	const variants: VariantSeed[] = []
	const products: string[] = []

	let variantIndex = 0
	for (let p = 0; p < PRODUCTS; p += 1) {
		const productId = `prod_sim_${p}_${crypto.randomUUID()}`
		products.push(productId)
		await upsertProduct({
			id: productId,
			name: `Hotel Sim ${p + 1}`,
			productType: "Hotel",
			destinationId,
			providerId,
		})

		for (let v = 0; v < VARIANTS_PER_PRODUCT; v += 1) {
			const profile = profileFor(variantIndex)
			const variantId = `var_sim_${variantIndex}_${crypto.randomUUID()}`
			const templateId = `rpt_sim_${variantIndex}_${crypto.randomUUID()}`
			const ratePlanId = `rp_sim_${variantIndex}_${crypto.randomUUID()}`
			await upsertVariant({
				id: variantId,
				productId,
				kind: "hotel_room",
				name: `Habitación ${variantIndex + 1}`,
				baseRateCurrency: "USD",
				baseRatePrice: 80 + (variantIndex % 20),
				isActive: true,
				minOccupancy: 1,
				maxOccupancy: 4,
			})
			await upsertRatePlanTemplate({
				id: templateId,
				name: `Default ${variantIndex + 1}`,
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

			for (let d = 0; d < dates.length; d += 1) {
				const date = dates[d]
				const basePrice = 80 + (variantIndex % 20) + (d % 7) * 2
				let availableUnits = 0
				let isSellable = false
				if (profile === "high") {
					availableUnits = 8 + (d % 3)
					isSellable = true
				} else if (profile === "low") {
					availableUnits = d % 2 === 0 ? 1 : 2
					isSellable = true
				}
				await db
					.insert(EffectiveAvailability)
					.values({
						id: `ea_sim_${variantId}_${date}`,
						variantId,
						date,
						totalUnits: Math.max(availableUnits, 1),
						heldUnits: 0,
						bookedUnits: Math.max(0, Math.max(availableUnits, 1) - availableUnits),
						availableUnits,
						stopSell: false,
						isSellable: isSellable && availableUnits > 0,
						computedAt: new Date(),
					} as any)
					.onConflictDoUpdate({
						target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
						set: {
							totalUnits: Math.max(availableUnits, 1),
							heldUnits: 0,
							bookedUnits: Math.max(0, Math.max(availableUnits, 1) - availableUnits),
							availableUnits,
							stopSell: false,
							isSellable: isSellable && availableUnits > 0,
							computedAt: new Date(),
						},
					})

				await db
					.insert(EffectivePricing)
					.values({
						id: `ep_sim_${variantId}_${ratePlanId}_${date}`,
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

			await materializeSearchUnitRange({
				variantId,
				ratePlanId,
				from: START_DATE,
				to: addDays(START_DATE, DAYS),
				currency: "USD",
			})

			variants.push({ productId, variantId, ratePlanId, profile })
			variantIndex += 1
		}
	}

	return { variants, products }
}

async function validateCoverage(products: string[]) {
	const request = new Request(
		`http://localhost:4321/api/internal/search/coverage?from=${encodeURIComponent(START_DATE)}&to=${encodeURIComponent(addDays(START_DATE, DAYS))}&occupancies=1,2,3,4`,
		{ method: "GET" }
	)
	const response = await getCoverage({ request, url: new URL(request.url) } as any)
	const body = await response.json()
	return body
}

async function runRandomQueries(params: { variants: VariantSeed[]; iterations: number }) {
	let falseEmpty = 0
	let falseNonEmpty = 0
	let empty = 0
	let nonEmpty = 0

	for (let i = 0; i < params.iterations; i += 1) {
		const productId = pick(Array.from(new Set(params.variants.map((v) => v.productId))))
		const fromOffset = randInt(0, DAYS - 8)
		const nights = randInt(1, 7)
		const rooms = randInt(1, 3)
		const adults = randInt(1, 4)
		const checkIn = addDays(START_DATE, fromOffset)
		const checkOut = addDays(checkIn, nights)

		const offers = await searchOffers({
			productId,
			checkIn: new Date(`${checkIn}T00:00:00.000Z`),
			checkOut: new Date(`${checkOut}T00:00:00.000Z`),
			rooms,
			adults,
			children: 0,
		})
		const gotAny = offers.length > 0
		if (gotAny) nonEmpty += 1
		else empty += 1

		const expectedAny = params.variants
			.filter((v) => v.productId === productId)
			.some((v) => expectedSellableForStay({ profile: v.profile, fromOffset, nights, rooms }))

		if (!gotAny && expectedAny) falseEmpty += 1
		if (gotAny && !expectedAny) falseNonEmpty += 1
	}

	return { falseEmpty, falseNonEmpty, empty, nonEmpty }
}

async function runStressQueries(params: { variants: VariantSeed[] }) {
	const products = Array.from(new Set(params.variants.map((v) => v.productId)))
	const queue = Array.from({ length: STRESS_QUERIES }, (_, i) => i)
	let processed = 0

	async function worker() {
		while (queue.length > 0) {
			queue.pop()
			const productId = pick(products)
			const fromOffset = randInt(0, DAYS - 8)
			const nights = randInt(1, 7)
			const rooms = randInt(1, 3)
			const adults = randInt(1, 4)
			const checkIn = addDays(START_DATE, fromOffset)
			const checkOut = addDays(checkIn, nights)
			await searchOffers({
				productId,
				checkIn: new Date(`${checkIn}T00:00:00.000Z`),
				checkOut: new Date(`${checkOut}T00:00:00.000Z`),
				rooms,
				adults,
				children: 0,
			})
			processed += 1
		}
	}

	await Promise.all(
		Array.from({ length: STRESS_CONCURRENCY }, async () => {
			await worker()
		})
	)
	return { processed }
}

async function validateAutoBackfill() {
	const productId = `prod_auto_${crypto.randomUUID()}`
	const variantId = `var_auto_${crypto.randomUUID()}`
	const templateId = `rpt_auto_${crypto.randomUUID()}`
	const ratePlanId = `rp_auto_${crypto.randomUUID()}`
	const destinationId = `dest_auto_${crypto.randomUUID()}`
	const providerId = `prov_auto_${crypto.randomUUID()}`
	const start = "2026-09-01"
	const end = "2026-09-03"

	await upsertDestination({
		id: destinationId,
		name: "AutoBackfill Dest",
		type: "city",
		country: "CL",
		slug: `auto-${destinationId}`,
	})
	await upsertProvider({
		id: providerId,
		displayName: "AutoBackfill Provider",
		ownerEmail: "autobackfill@example.com",
	})
	await upsertProduct({
		id: productId,
		name: "AutoBackfill Product",
		productType: "Hotel",
		destinationId,
		providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "AutoBackfill Room",
		baseRateCurrency: "USD",
		baseRatePrice: 120,
		minOccupancy: 1,
		maxOccupancy: 4,
	})
	await upsertRatePlanTemplate({
		id: templateId,
		name: "AutoBackfill Template",
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

	for (const date of [start, addDays(start, 1)]) {
		await db
			.insert(EffectiveAvailability)
			.values({
				id: `ea_auto_${variantId}_${date}`,
				variantId,
				date,
				totalUnits: 5,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: 5,
				stopSell: false,
				isSellable: true,
				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					totalUnits: 5,
					heldUnits: 0,
					bookedUnits: 0,
					availableUnits: 5,
					stopSell: false,
					isSellable: true,
					computedAt: new Date(),
				},
			})
		await db
			.insert(EffectivePricing)
			.values({
				id: `ep_auto_${variantId}_${ratePlanId}_${date}`,
				variantId,
				ratePlanId,
				date,
				basePrice: 120,
				finalBasePrice: 120,
				yieldMultiplier: 1,
				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [EffectivePricing.variantId, EffectivePricing.ratePlanId, EffectivePricing.date],
				set: {
					basePrice: 120,
					finalBasePrice: 120,
					yieldMultiplier: 1,
					computedAt: new Date(),
				},
			})
	}

	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: start,
		to: end,
		currency: "USD",
	})

	const occupancyKey = buildOccupancyKey({
		rooms: 1,
		adults: 2,
		children: 0,
		totalGuests: 2,
	})
	await db
		.delete(SearchUnitView)
		.where(
			and(
				eq(SearchUnitView.variantId, variantId),
				eq(SearchUnitView.ratePlanId, ratePlanId),
				eq(SearchUnitView.occupancyKey, occupancyKey),
				gte(SearchUnitView.date, start),
				lt(SearchUnitView.date, end)
			)
		)
		.run()

	const before = readCounter("search_view_autobackfill_success_total", {
		endpoint: "searchOffers",
		reason: "missing_view_data",
	})
	const first = await searchOffers({
		productId,
		checkIn: new Date(`${start}T00:00:00.000Z`),
		checkOut: new Date(`${end}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})

	const waitUntil = Date.now() + 7000
	while (Date.now() < waitUntil) {
		const count = await db
			.select({ c: sql<number>`count(*)` })
			.from(SearchUnitView)
			.where(
				and(
					eq(SearchUnitView.variantId, variantId),
					eq(SearchUnitView.ratePlanId, ratePlanId),
					eq(SearchUnitView.occupancyKey, occupancyKey),
					gte(SearchUnitView.date, start),
					lt(SearchUnitView.date, end)
				)
			)
			.get()
		if (Number(count?.c ?? 0) >= 2) break
		await new Promise((resolve) => setTimeout(resolve, 100))
	}

	const second = await searchOffers({
		productId,
		checkIn: new Date(`${start}T00:00:00.000Z`),
		checkOut: new Date(`${end}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})
	const after = readCounter("search_view_autobackfill_success_total", {
		endpoint: "searchOffers",
		reason: "missing_view_data",
	})

	return {
		initialEmpty: first.length === 0,
		recovered: second.length > 0,
		backfillTriggered: after > before,
	}
}

async function run() {
	console.log("search_readmodel_simulation:start")
	const seeded = await seedDataset()
	const coverage = await validateCoverage(seeded.products)
	const random = await runRandomQueries({ variants: seeded.variants, iterations: 400 })
	const stress = await runStressQueries({ variants: seeded.variants })
	const autoBackfill = await validateAutoBackfill()

	const endpoint = "searchOffers"
	const totalRequests = readCounter("search_view_requests_total", { endpoint })
	const errors = readCounter("search_view_error_total", { endpoint })
	const anomalousEmptyTotal =
		readCounter("search_view_anomalous_empty_total", { endpoint, reason: "missing_view_data" }) +
		readCounter("search_view_anomalous_empty_total", { endpoint, reason: "missing_view_price" }) +
		readCounter("search_view_anomalous_empty_total", { endpoint, reason: "inconsistent_view_data" })
	const p95 = readTimingQuantile("search_latency_ms", 0.95, { endpoint, engine: "view" })

	const report = {
		dataset: {
			products: seeded.products.length,
			variants: seeded.variants.length,
			days: DAYS,
			occupancies: OCCUPANCIES,
		},
		coverage: {
			globalCoveragePct: Number(coverage?.globalCoveragePct ?? 0),
			variantsWithGaps: Number(coverage?.variantsWithGaps ?? -1),
			globalMissingRows: Number(coverage?.globalMissingRows ?? -1),
		},
		randomValidation: random,
		stress: {
			queries: stress.processed,
			p95LatencyMs: p95,
			errorRatePct: totalRequests > 0 ? Number(((errors / totalRequests) * 100).toFixed(4)) : 0,
			anomalousEmptyRatePct:
				totalRequests > 0 ? Number(((anomalousEmptyTotal / totalRequests) * 100).toFixed(4)) : 0,
		},
		autoBackfill,
	}

	console.log("search_readmodel_simulation:report")
	console.log(JSON.stringify(report, null, 2))
}

run().catch((error) => {
	console.error("search_readmodel_simulation:error", error)
	process.exitCode = 1
})
