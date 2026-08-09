import "dotenv/config"

import {
	createCommercialPriceRule,
	createCommercialSellabilityRule,
} from "@/lib/commercial-rules/commercialRulesRepository"
import {
	enqueueProviderIncrementalAriChange,
	type IncrementalAriDomain,
} from "@/lib/channel-manager/channel-manager-incremental-queue"
import { runScheduledProviderIntegrationSync } from "@/lib/provider-integration-scheduler"
import {
	and,
	db,
	desc,
	eq,
	DailyInventory,
	ProviderIntegrationSyncRun,
} from "@/shared/infrastructure/db/compat"
import { closePostgresClients } from "@/shared/infrastructure/db/client"
import { waitForProviderConfigurationRefreshes } from "@/lib/cache/invalidation"

const PROVIDER_ID = "fastt-channex-certification-provider-v1"
const CONNECTION_ID = "e38ffcd8-5f1e-4567-b71c-241120938304"
const CERTIFICATION_ID = "fastt-channex-certification-session-v1"
const ROOM_TWIN = "fastt-channex-certification-room-standard-v1"
const ROOM_DOUBLE = "fastt-channex-certification-room-deluxe-v1"
const RATE_TWIN_BAR = "fastt-channex-certification-rate-standard-flex-v1"
const RATE_TWIN_BB = "fastt-channex-certification-rate-standard-refundable-v1"
const RATE_DOUBLE_BAR = "fastt-channex-certification-rate-deluxe-flex-v1"
const RATE_DOUBLE_BB = "fastt-channex-certification-rate-deluxe-refundable-v1"

type Scenario =
	| "single_rate"
	| "multiple_rates"
	| "range_rates"
	| "min_stay"
	| "stop_sell"
	| "arrival_departure"
	| "availability"

function assertExplicitConfirmation() {
	if (process.env.CHANNEX_CERTIFICATION_EXECUTE !== "true") {
		throw new Error("CHANNEX_CERTIFICATION_EXECUTE_TRUE_REQUIRED")
	}
}

function day(offset: number) {
	const value = new Date()
	value.setUTCDate(value.getUTCDate() + offset)
	return value.toISOString().slice(0, 10)
}

function exclusive(date: string) {
	const value = new Date(`${date}T00:00:00.000Z`)
	value.setUTCDate(value.getUTCDate() + 1)
	return value.toISOString().slice(0, 10)
}

function taskIds(summary: unknown): string[] {
	if (!summary || typeof summary !== "object") return []
	const request = (summary as Record<string, any>).request
	return Array.isArray(request?.taskIds) ? request.taskIds.map(String) : []
}

async function execute(params: {
	scenario: Scenario
	domain: IncrementalAriDomain
	variantIds?: string[]
	ratePlanIds?: string[]
	from: string
	toExclusive: string
	step: number
}) {
	const virtualNow = new Date(Date.now() + params.step * 120_000)
	await enqueueProviderIncrementalAriChange({
		domain: params.domain,
		variantIds: params.variantIds,
		ratePlanIds: params.ratePlanIds,
		from: params.from,
		toExclusive: params.toExclusive,
		now: virtualNow,
		certificationId: CERTIFICATION_ID,
		certificationScenario: params.scenario,
	})
	let run: { id: string; status: string; summaryJson: unknown } | null = null
	for (let attempt = 0; attempt < 4 && !run; attempt += 1) {
		const worker = await runScheduledProviderIntegrationSync({
			providerId: PROVIDER_ID,
			now: new Date(virtualNow.getTime() + 120_000),
			batchSize: 1,
			concurrency: 1,
			providerLimit: 1,
		})
		if (worker.failed > 0) throw new Error(`CERTIFICATION_${params.scenario}_WORKER_FAILED`)
		run = await db
			.select({
				id: ProviderIntegrationSyncRun.id,
				status: ProviderIntegrationSyncRun.status,
				summaryJson: ProviderIntegrationSyncRun.summaryJson,
			})
			.from(ProviderIntegrationSyncRun)
			.where(
				and(
					eq(ProviderIntegrationSyncRun.providerId, PROVIDER_ID),
					eq(ProviderIntegrationSyncRun.connectionId, CONNECTION_ID),
					eq(ProviderIntegrationSyncRun.certificationId, CERTIFICATION_ID)
				)
			)
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.then(
				(rows) =>
					rows.find((row) => {
						const summary = row.summaryJson as Record<string, any> | null
						return summary?.execution?.scenario === params.scenario
					}) ?? null
			)
	}
	if (!run || run.status !== "succeeded" || !taskIds(run.summaryJson).length) {
		throw new Error(`CERTIFICATION_${params.scenario}_RUN_INVALID`)
	}
	return { scenario: params.scenario, runId: run.id, taskIds: taskIds(run.summaryJson) }
}

async function main() {
	assertExplicitConfirmation()
	const base = 120
	const d1 = day(base)
	const d2 = day(base + 2)
	const d5 = day(base + 5)
	const d11 = day(base + 11)
	const d12 = day(base + 12)
	const d13 = day(base + 13)
	const d15 = day(base + 15)

	await createCommercialPriceRule({
		providerId: PROVIDER_ID,
		ratePlanId: RATE_TWIN_BAR,
		type: "fixed",
		value: 333,
		priority: 1,
		dateRangeJson: { from: d1, to: d1 },
	})
	const single = await execute({
		scenario: "single_rate",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_TWIN_BAR],
		variantIds: [ROOM_TWIN],
		from: d1,
		toExclusive: exclusive(d1),
		step: 1,
	})

	await Promise.all([
		createCommercialPriceRule({
			providerId: PROVIDER_ID,
			ratePlanId: RATE_TWIN_BAR,
			type: "fixed",
			value: 333,
			priority: 1,
			dateRangeJson: { from: d2, to: d2 },
		}),
		createCommercialPriceRule({
			providerId: PROVIDER_ID,
			ratePlanId: RATE_DOUBLE_BAR,
			type: "fixed",
			value: 444,
			priority: 1,
			dateRangeJson: { from: day(base + 3), to: day(base + 3) },
		}),
		createCommercialPriceRule({
			providerId: PROVIDER_ID,
			ratePlanId: RATE_DOUBLE_BB,
			type: "fixed",
			value: 456.23,
			priority: 1,
			dateRangeJson: { from: day(base + 4), to: day(base + 4) },
		}),
	])
	const multiple = await execute({
		scenario: "multiple_rates",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_TWIN_BAR, RATE_DOUBLE_BAR, RATE_DOUBLE_BB],
		variantIds: [ROOM_TWIN, ROOM_DOUBLE],
		from: d2,
		toExclusive: day(base + 5),
		step: 2,
	})

	await createCommercialPriceRule({
		providerId: PROVIDER_ID,
		ratePlanId: RATE_TWIN_BB,
		type: "fixed",
		value: 241,
		priority: 1,
		dateRangeJson: { from: d5, to: day(base + 10) },
	})
	const range = await execute({
		scenario: "range_rates",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_TWIN_BB],
		variantIds: [ROOM_TWIN],
		from: d5,
		toExclusive: day(base + 11),
		step: 3,
	})

	await createCommercialSellabilityRule({
		providerId: PROVIDER_ID,
		scope: "rate_plan",
		scopeId: RATE_TWIN_BAR,
		type: "min_los",
		value: 3,
		startDate: d11,
		endDate: d11,
		priority: 950,
	})
	const minStay = await execute({
		scenario: "min_stay",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_TWIN_BAR],
		variantIds: [ROOM_TWIN],
		from: d11,
		toExclusive: exclusive(d11),
		step: 4,
	})

	await createCommercialSellabilityRule({
		providerId: PROVIDER_ID,
		scope: "rate_plan",
		scopeId: RATE_DOUBLE_BAR,
		type: "stop_sell",
		startDate: d12,
		endDate: d12,
		priority: 950,
	})
	const stopSell = await execute({
		scenario: "stop_sell",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_DOUBLE_BAR],
		variantIds: [ROOM_DOUBLE],
		from: d12,
		toExclusive: exclusive(d12),
		step: 5,
	})

	await Promise.all([
		createCommercialSellabilityRule({
			providerId: PROVIDER_ID,
			scope: "rate_plan",
			scopeId: RATE_TWIN_BAR,
			type: "cta",
			startDate: d13,
			endDate: d13,
			priority: 950,
		}),
		createCommercialSellabilityRule({
			providerId: PROVIDER_ID,
			scope: "rate_plan",
			scopeId: RATE_TWIN_BB,
			type: "ctd",
			startDate: d13,
			endDate: d13,
			priority: 950,
		}),
	])
	const arrivalDeparture = await execute({
		scenario: "arrival_departure",
		domain: "rates_restrictions",
		ratePlanIds: [RATE_TWIN_BAR, RATE_TWIN_BB],
		variantIds: [ROOM_TWIN],
		from: d13,
		toExclusive: exclusive(d13),
		step: 6,
	})

	await Promise.all([
		db
			.update(DailyInventory)
			.set({ reservedCount: 1, updatedAt: new Date() })
			.where(and(eq(DailyInventory.variantId, ROOM_TWIN), eq(DailyInventory.date, d15))),
		db
			.update(DailyInventory)
			.set({ reservedCount: 1, updatedAt: new Date() })
			.where(
				and(eq(DailyInventory.variantId, ROOM_DOUBLE), eq(DailyInventory.date, day(base + 16)))
			),
	])
	const availability = await execute({
		scenario: "availability",
		domain: "availability",
		variantIds: [ROOM_TWIN, ROOM_DOUBLE],
		from: d15,
		toExclusive: day(base + 17),
		step: 7,
	})

	console.log(
		JSON.stringify(
			{
				ok: true,
				results: [single, multiple, range, minStay, stopSell, arrivalDeparture, availability],
			},
			null,
			2
		)
	)
}

main()
	.catch((error) => {
		console.error(
			error instanceof Error ? error.message : "CHANNEX_CERTIFICATION_INCREMENTALS_FAILED"
		)
		process.exitCode = 1
	})
	.finally(async () => {
		await waitForProviderConfigurationRefreshes()
		await closePostgresClients()
	})
