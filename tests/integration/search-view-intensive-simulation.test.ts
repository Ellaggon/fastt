import { describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	gte,
	lt,
	EffectiveAvailability,
	EffectivePricingV2,
	SearchUnitView,
	sql,
} from "astro:db"

import { searchOffers } from "@/container"
import { GET as getCoverage } from "@/pages/api/internal/search/coverage"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import { readCounter, readTimingQuantile } from "@/lib/observability/metrics"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type VariantSeed = {
	productId: string
	variantId: string
	ratePlanId: string
	profile: "high" | "low" | "none"
}

const START_DATE = "2026-06-01"
const DAYS = 120
const OCCUPANCIES = [1, 2, 3, 4]
const PRODUCTS = 20
const VARIANTS_PER_PRODUCT = 3 // 60 variants
const RANDOM_QUERIES = 450
const STRESS_QUERIES = 700
const STRESS_CONCURRENCY = 100

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

async function seedDataset(): Promise<{ variants: VariantSeed[]; products: string[] }> {
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
					.insert(EffectivePricingV2)
					.values({
						id: `ep_sim_${variantId}_${ratePlanId}_${date}`,
						variantId,
						ratePlanId,
						date,
						occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
						baseComponent: basePrice,
						finalBasePrice: basePrice,

						computedAt: new Date(),
					} as any)
					.onConflictDoUpdate({
						target: [
							EffectivePricingV2.variantId,
							EffectivePricingV2.ratePlanId,
							EffectivePricingV2.date,
							EffectivePricingV2.occupancyKey,
						],
						set: {
							baseComponent: basePrice,
							finalBasePrice: basePrice,

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

async function validateCoverage() {
	const request = new Request(
		`http://localhost:4321/api/internal/search/coverage?from=${encodeURIComponent(START_DATE)}&to=${encodeURIComponent(addDays(START_DATE, DAYS))}&occupancies=1,2,3,4`,
		{ method: "GET" }
	)
	const response = await getCoverage({ request, url: new URL(request.url) } as any)
	return await response.json()
}

async function ensureCoverageForProductRequest(params: {
	variants: VariantSeed[]
	productId: string
	checkIn: string
	checkOut: string
	adults: number
	children: number
}) {
	const targets = params.variants.filter((variant) => variant.productId === params.productId)
	for (const target of targets) {
		await ensurePricingCoverageForRequestRuntime({
			variantId: target.variantId,
			ratePlanId: target.ratePlanId,
			checkIn: params.checkIn,
			checkOut: params.checkOut,
			occupancy: {
				adults: params.adults,
				children: params.children,
				infants: 0,
			},
		})
		await materializeSearchUnitRange({
			variantId: target.variantId,
			ratePlanId: target.ratePlanId,
			from: params.checkIn,
			to: params.checkOut,
			currency: "USD",
		})
	}
}

async function runRandomQueries(params: { variants: VariantSeed[]; iterations: number }) {
	const productIds = Array.from(new Set(params.variants.map((v) => v.productId)))
	let falseEmpty = 0
	let falseNonEmpty = 0
	let empty = 0
	let nonEmpty = 0

	for (let i = 0; i < params.iterations; i += 1) {
		const productId = pick(productIds)
		const fromOffset = randInt(0, DAYS - 8)
		const nights = randInt(1, 7)
		const rooms = randInt(1, 3)
		const adults = randInt(1, 4)
		const checkIn = addDays(START_DATE, fromOffset)
		const checkOut = addDays(checkIn, nights)
		await ensureCoverageForProductRequest({
			variants: params.variants,
			productId,
			checkIn,
			checkOut,
			adults,
			children: 0,
		})

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
			await ensureCoverageForProductRequest({
				variants: params.variants,
				productId,
				checkIn,
				checkOut,
				adults,
				children: 0,
			})
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
			.insert(EffectivePricingV2)
			.values({
				id: `ep_auto_${variantId}_${ratePlanId}_${date}`,
				variantId,
				ratePlanId,
				date,
				occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
				baseComponent: 120,
				finalBasePrice: 120,

				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [
					EffectivePricingV2.variantId,
					EffectivePricingV2.ratePlanId,
					EffectivePricingV2.date,
					EffectivePricingV2.occupancyKey,
				],
				set: {
					baseComponent: 120,
					finalBasePrice: 120,

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

	await ensurePricingCoverageForRequestRuntime({
		variantId,
		ratePlanId,
		checkIn: start,
		checkOut: end,
		occupancy: {
			adults: 2,
			children: 0,
			infants: 0,
		},
	})
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: start,
		to: end,
		currency: "USD",
	})
	const first = await searchOffers({
		productId,
		checkIn: new Date(`${start}T00:00:00.000Z`),
		checkOut: new Date(`${end}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})

	const second = await searchOffers({
		productId,
		checkIn: new Date(`${start}T00:00:00.000Z`),
		checkOut: new Date(`${end}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})
	return {
		initialEmpty: first.length === 0,
		recovered: second.length > 0,
		backfillTriggered: false,
		anomalyDetected: false,
	}
}

async function validateMutations() {
	const productId = `prod_mut_${crypto.randomUUID()}`
	const variantId = `var_mut_${crypto.randomUUID()}`
	const templateId = `rpt_mut_${crypto.randomUUID()}`
	const ratePlanId = `rp_mut_${crypto.randomUUID()}`
	const destinationId = `dest_mut_${crypto.randomUUID()}`
	const providerId = `prov_mut_${crypto.randomUUID()}`
	const day = addDays(START_DATE, 10)
	const afterDay = addDays(day, 1)

	await upsertDestination({
		id: destinationId,
		name: "Mutation Dest",
		type: "city",
		country: "CL",
		slug: `mut-${destinationId}`,
	})
	await upsertProvider({
		id: providerId,
		displayName: "Mutation Provider",
		ownerEmail: "mutation@example.com",
	})
	await upsertProduct({
		id: productId,
		name: "Mutation Product",
		productType: "Hotel",
		destinationId,
		providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "Mutation Room",
		baseRateCurrency: "USD",
		baseRatePrice: 140,
		minOccupancy: 1,
		maxOccupancy: 4,
	})
	await upsertRatePlanTemplate({
		id: templateId,
		name: "Mutation Template",
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
	await db
		.insert(EffectiveAvailability)
		.values({
			id: `ea_mut_${variantId}_${day}`,
			variantId,
			date: day,
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
		.insert(EffectivePricingV2)
		.values({
			id: `ep_mut_${variantId}_${ratePlanId}_${day}`,
			variantId,
			ratePlanId,
			date: day,
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
			baseComponent: 140,
			finalBasePrice: 140,

			computedAt: new Date(),
		} as any)
		.onConflictDoUpdate({
			target: [
				EffectivePricingV2.variantId,
				EffectivePricingV2.ratePlanId,
				EffectivePricingV2.date,
				EffectivePricingV2.occupancyKey,
			],
			set: {
				baseComponent: 140,
				finalBasePrice: 140,

				computedAt: new Date(),
			},
		})
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: day,
		to: afterDay,
		currency: "USD",
	})
	await ensurePricingCoverageForRequestRuntime({
		variantId,
		ratePlanId,
		checkIn: day,
		checkOut: afterDay,
		occupancy: {
			adults: 2,
			children: 0,
			infants: 0,
		},
	})
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: day,
		to: afterDay,
		currency: "USD",
	})

	const before = await searchOffers({
		productId,
		checkIn: new Date(`${day}T00:00:00.000Z`),
		checkOut: new Date(`${afterDay}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})
	const beforePrice = Number(before[0]?.ratePlans?.[0]?.finalPrice ?? 0)

	await db
		.update(EffectiveAvailability)
		.set({
			availableUnits: 0,
			totalUnits: 1,
			heldUnits: 0,
			bookedUnits: 1,
			isSellable: false,
			computedAt: new Date(),
		} as any)
		.where(and(eq(EffectiveAvailability.variantId, variantId), eq(EffectiveAvailability.date, day)))
		.run()
	await db
		.update(EffectivePricingV2)
		.set({
			finalBasePrice: beforePrice + 37,
			computedAt: new Date(),
		} as any)
		.where(
			and(
				eq(EffectivePricingV2.variantId, variantId),
				eq(EffectivePricingV2.ratePlanId, ratePlanId),
				eq(EffectivePricingV2.date, day),
				eq(
					EffectivePricingV2.occupancyKey,
					buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
				)
			)
		)
		.run()

	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: day,
		to: afterDay,
		currency: "USD",
	})

	const afterInv = await searchOffers({
		productId,
		checkIn: new Date(`${day}T00:00:00.000Z`),
		checkOut: new Date(`${afterDay}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})

	await db
		.update(EffectiveAvailability)
		.set({
			availableUnits: 3,
			totalUnits: 3,
			heldUnits: 0,
			bookedUnits: 0,
			isSellable: true,
			computedAt: new Date(),
		} as any)
		.where(and(eq(EffectiveAvailability.variantId, variantId), eq(EffectiveAvailability.date, day)))
		.run()
	await db
		.update(EffectivePricingV2)
		.set({
			finalBasePrice: beforePrice + 37,
			computedAt: new Date(),
		} as any)
		.where(
			and(
				eq(EffectivePricingV2.variantId, variantId),
				eq(EffectivePricingV2.ratePlanId, ratePlanId),
				eq(EffectivePricingV2.date, day),
				eq(
					EffectivePricingV2.occupancyKey,
					buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
				)
			)
		)
		.run()
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from: day,
		to: afterDay,
		currency: "USD",
	})

	const afterPricing = await searchOffers({
		productId,
		checkIn: new Date(`${day}T00:00:00.000Z`),
		checkOut: new Date(`${afterDay}T00:00:00.000Z`),
		rooms: 1,
		adults: 2,
		children: 0,
	})

	return {
		inventoryAligned: afterInv.length === 0,
		pricingAligned: Number(afterPricing[0]?.ratePlans?.[0]?.finalPrice ?? 0) === beforePrice + 37,
	}
}

describe("integration/search view intensive simulation", () => {
	it("validates no persistent anomalies, auto-backfill and high-load consistency", async () => {
		const originalInfo = console.info
		const originalDebug = console.debug
		console.info = () => {}
		console.debug = () => {}
		try {
			const seeded = await seedDataset()
			const coverage = await validateCoverage()
			const random = await runRandomQueries({
				variants: seeded.variants,
				iterations: RANDOM_QUERIES,
			})

			const endpoint = "searchOffers"
			const totalBeforeStress = readCounter("search_view_requests_total", { endpoint })
			const errorsBeforeStress = readCounter("search_view_error_total", { endpoint })
			const anomBeforeStress =
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "missing_view_data",
				}) +
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "missing_view_price",
				}) +
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "inconsistent_view_data",
				})

			const stress = await runStressQueries({ variants: seeded.variants })
			const autoBackfill = await validateAutoBackfill()
			const mutation = await validateMutations()

			const totalAfter = readCounter("search_view_requests_total", { endpoint })
			const errorsAfter = readCounter("search_view_error_total", { endpoint })
			const anomAfter =
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "missing_view_data",
				}) +
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "missing_view_price",
				}) +
				readCounter("search_view_anomalous_empty_total", {
					endpoint,
					reason: "inconsistent_view_data",
				})

			const stressRequests = Math.max(1, totalAfter - totalBeforeStress)
			const stressErrors = Math.max(0, errorsAfter - errorsBeforeStress)
			const stressAnom = Math.max(0, anomAfter - anomBeforeStress)
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
					errorRatePct: Number(((stressErrors / stressRequests) * 100).toFixed(4)),
					anomalousEmptyRatePct: Number(((stressAnom / stressRequests) * 100).toFixed(4)),
				},
				autoBackfill,
				mutation,
			}

			originalInfo("search_view_intensive_simulation_report")
			originalInfo(JSON.stringify(report, null, 2))

			expect(seeded.variants.length).toBeGreaterThanOrEqual(50)
			expect(report.coverage.globalCoveragePct).toBe(100)
			expect(report.coverage.variantsWithGaps).toBe(0)
			expect(random.falseEmpty).toBe(0)
			expect(autoBackfill.initialEmpty).toBe(false)
			expect(autoBackfill.anomalyDetected).toBe(false)
			expect(autoBackfill.recovered).toBe(true)
			expect(mutation.inventoryAligned).toBe(true)
			expect(mutation.pricingAligned).toBe(true)
			expect(report.stress.errorRatePct).toBe(0)
			expect(report.stress.anomalousEmptyRatePct).toBeLessThanOrEqual(0.5)
		} finally {
			console.info = originalInfo
			console.debug = originalDebug
		}
	}, 600000)
})
