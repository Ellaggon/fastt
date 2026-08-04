import { createHash } from "node:crypto"

import {
	ChannelManagerAdapterError,
	type ChannelManagerAdapter,
	type ChannelManagerAvailabilityUpdate,
	type ChannelManagerMutationResult,
	type ChannelManagerRateRestrictionUpdate,
} from "@/lib/channel-manager/channel-manager-adapter"
import {
	parseIncrementalAriJobPayload,
	type IncrementalAriJobPayload,
} from "@/lib/channel-manager/channel-manager-incremental-queue"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"
import {
	finishProviderIntegrationSyncRun,
	listProviderIntegrationMappingsForConnection,
	recordProviderIntegrationIncident,
	startProviderIntegrationSyncRun,
} from "@/lib/provider-integration-operations"
import { getProviderChannelManagerRuntime } from "@/lib/provider-integrations"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"
import { recomputeEffectiveRestrictionsForVariantRange } from "@/modules/rules/public"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import {
	and,
	asc,
	db,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	eq,
	gte,
	inArray,
	lt,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncRun,
	RatePlan,
	sql,
} from "@/shared/infrastructure/db/compat"

const CANONICAL_OCCUPANCY = { adults: 2, children: 0, infants: 0 } as const
const CANONICAL_OCCUPANCY_KEY = buildOccupancyKey(normalizeOccupancy(CANONICAL_OCCUPANCY))
const CHANNEX_DOMAIN_LIMIT_PER_MINUTE = 10

function normalizeDate(value: unknown): string {
	return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10)
}

function addDays(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, toExclusive: string): number {
	return Math.max(
		0,
		Math.round(
			(new Date(`${toExclusive}T00:00:00.000Z`).getTime() -
				new Date(`${from}T00:00:00.000Z`).getTime()) /
				86_400_000
		)
	)
}

function stableHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function compressRanges<T extends { date: string }>(
	rows: T[],
	equal: (left: T, right: T) => boolean
): Array<{ from: string; to: string; value: T }> {
	if (!rows.length) return []
	const result: Array<{ from: string; to: string; value: T }> = []
	let first = rows[0]
	let previous = rows[0]
	for (const current of rows.slice(1)) {
		if (current.date === addDays(previous.date, 1) && equal(previous, current)) {
			previous = current
			continue
		}
		result.push({ from: first.date, to: previous.date, value: first })
		first = current
		previous = current
	}
	result.push({ from: first.date, to: previous.date, value: first })
	return result
}

function mutationSummary(result: ChannelManagerMutationResult) {
	return {
		taskIds: result.taskIds,
		requestIds: result.requestIds,
		submitted: result.submitted,
		accepted: result.accepted,
		warned: result.warnings.length,
		rejected: result.rejected,
	}
}

async function enforceDomainRateLimit(params: {
	connectionId: string
	operation: string
	now: Date
}) {
	const since = new Date(params.now.getTime() - 60_000)
	const recent = await db
		.select({ id: ProviderIntegrationSyncRun.id })
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
				eq(ProviderIntegrationSyncRun.operation, params.operation),
				gte(ProviderIntegrationSyncRun.startedAt, since)
			)
		)
	if (recent.length > CHANNEX_DOMAIN_LIMIT_PER_MINUTE) {
		throw new ChannelManagerAdapterError({
			kind: "rate_limit",
			message: "CHANNEL_MANAGER_LOCAL_RATE_LIMIT",
			status: 429,
			retryable: true,
		})
	}
}

async function buildAvailability(params: {
	payload: IncrementalAriJobPayload
	propertyId: string
	roomExternalByLocal: Map<string, string>
}) {
	const variantIds = params.payload.variantIds.filter((id) => params.roomExternalByLocal.has(id))
	for (const variantId of variantIds) {
		await recomputeEffectiveAvailabilityRange({
			variantId,
			from: params.payload.from,
			to: params.payload.toExclusive,
			reason: "channel_manager_incremental_ari",
		})
	}
	if (!variantIds.length) throw new Error("INCREMENTAL_ARI_ROOM_MAPPING_REQUIRED")
	const rows = await db
		.select({
			variantId: EffectiveAvailability.variantId,
			date: EffectiveAvailability.date,
			availableUnits: EffectiveAvailability.availableUnits,
		})
		.from(EffectiveAvailability)
		.where(
			and(
				inArray(EffectiveAvailability.variantId, variantIds),
				gte(EffectiveAvailability.date, params.payload.from),
				lt(EffectiveAvailability.date, params.payload.toExclusive)
			)
		)
		.orderBy(asc(EffectiveAvailability.variantId), asc(EffectiveAvailability.date))
	const values: ChannelManagerAvailabilityUpdate[] = []
	const expectedDays = daysBetween(params.payload.from, params.payload.toExclusive)
	for (const variantId of variantIds) {
		const daily = rows
			.filter((row) => row.variantId === variantId)
			.map((row) => ({
				date: normalizeDate(row.date),
				availability: Math.max(0, Number(row.availableUnits)),
			}))
		if (new Set(daily.map((row) => row.date)).size !== expectedDays) {
			throw new Error(`INCREMENTAL_ARI_AVAILABILITY_INCOMPLETE:${variantId}`)
		}
		for (const range of compressRanges(daily, (a, b) => a.availability === b.availability)) {
			values.push({
				propertyId: params.propertyId,
				roomTypeId: params.roomExternalByLocal.get(variantId) ?? "",
				dateFrom: range.from,
				dateTo: range.to,
				availability: range.value.availability,
			})
		}
	}
	return { values, entities: variantIds.length, days: expectedDays }
}

async function buildRatesAndRestrictions(params: {
	payload: IncrementalAriJobPayload
	propertyId: string
	rateExternalByLocal: Map<string, string>
}) {
	const ratePlanIds = params.payload.ratePlanIds.filter((id) => params.rateExternalByLocal.has(id))
	if (!ratePlanIds.length) throw new Error("INCREMENTAL_ARI_RATE_MAPPING_REQUIRED")
	const plans = await db
		.select({ id: RatePlan.id, variantId: RatePlan.variantId, isActive: RatePlan.isActive })
		.from(RatePlan)
		.where(inArray(RatePlan.id, ratePlanIds))
	for (const plan of plans) {
		await Promise.all([
			ensurePricingCoverageRuntime({
				variantId: plan.variantId,
				ratePlanId: plan.id,
				from: params.payload.from,
				to: params.payload.toExclusive,
				recomputeExisting: true,
				occupancy: CANONICAL_OCCUPANCY,
				enqueueIncremental: false,
			}),
			recomputeEffectiveRestrictionsForVariantRange({
				variantId: plan.variantId,
				from: params.payload.from,
				to: params.payload.toExclusive,
				reason: "channel_manager_incremental_ari",
			}),
		])
	}
	const [prices, restrictions] = await Promise.all([
		db
			.select({
				ratePlanId: EffectivePricingV2.ratePlanId,
				date: EffectivePricingV2.date,
				finalBasePrice: EffectivePricingV2.finalBasePrice,
				currency: EffectivePricingV2.currency,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					inArray(EffectivePricingV2.ratePlanId, ratePlanIds),
					eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY),
					gte(EffectivePricingV2.date, params.payload.from),
					lt(EffectivePricingV2.date, params.payload.toExclusive)
				)
			),
		db
			.select({
				ratePlanId: EffectiveRestriction.ratePlanId,
				date: EffectiveRestriction.date,
				minStay: EffectiveRestriction.minStay,
				maxStay: EffectiveRestriction.maxStay,
				cta: EffectiveRestriction.cta,
				ctd: EffectiveRestriction.ctd,
				stopSell: EffectiveRestriction.stopSell,
			})
			.from(EffectiveRestriction)
			.where(
				and(
					inArray(EffectiveRestriction.ratePlanId, ratePlanIds),
					gte(EffectiveRestriction.date, params.payload.from),
					lt(EffectiveRestriction.date, params.payload.toExclusive)
				)
			),
	])
	const values: ChannelManagerRateRestrictionUpdate[] = []
	const expectedDays = daysBetween(params.payload.from, params.payload.toExclusive)
	for (const ratePlanId of ratePlanIds) {
		const ratePlan = plans.find((plan) => plan.id === ratePlanId)
		if (!ratePlan) throw new Error(`INCREMENTAL_ARI_RATE_PLAN_NOT_FOUND:${ratePlanId}`)
		const priceByDate = new Map(
			prices
				.filter((row) => row.ratePlanId === ratePlanId)
				.map((row) => [normalizeDate(row.date), row])
		)
		const restrictionByDate = new Map(
			restrictions
				.filter((row) => row.ratePlanId === ratePlanId)
				.map((row) => [normalizeDate(row.date), row])
		)
		const daily = [] as Array<{
			date: string
			rate: string
			minStay: number
			maxStay: number
			cta: boolean
			ctd: boolean
			stopSell: boolean
		}>
		for (let offset = 0; offset < expectedDays; offset += 1) {
			const date = addDays(params.payload.from, offset)
			const price = priceByDate.get(date)
			const restriction = restrictionByDate.get(date)
			const amount = Number(price?.finalBasePrice)
			if (!price || !Number.isFinite(amount) || amount <= 0) {
				throw new Error(`INCREMENTAL_ARI_PRICE_INVALID:${ratePlanId}:${date}`)
			}
			if (!restriction) throw new Error(`INCREMENTAL_ARI_RESTRICTION_MISSING:${ratePlanId}:${date}`)
			daily.push({
				date,
				rate: amount.toFixed(2),
				minStay: Math.max(1, Number(restriction.minStay ?? 1)),
				maxStay: Math.max(0, Number(restriction.maxStay ?? 0)),
				cta: Boolean(restriction.cta),
				ctd: Boolean(restriction.ctd),
				stopSell: !ratePlan.isActive || Boolean(restriction.stopSell),
			})
		}
		for (const range of compressRanges(
			daily,
			(a, b) =>
				a.rate === b.rate &&
				a.minStay === b.minStay &&
				a.maxStay === b.maxStay &&
				a.cta === b.cta &&
				a.ctd === b.ctd &&
				a.stopSell === b.stopSell
		)) {
			values.push({
				propertyId: params.propertyId,
				ratePlanId: params.rateExternalByLocal.get(ratePlanId) ?? "",
				dateFrom: range.from,
				dateTo: range.to,
				rate: range.value.rate,
				minStay: range.value.minStay,
				maxStay: range.value.maxStay,
				closedToArrival: range.value.cta,
				closedToDeparture: range.value.ctd,
				stopSell: range.value.stopSell,
			})
		}
	}
	return { values, entities: ratePlanIds.length, days: expectedDays }
}

export function incrementalAriRetryMinutes(attempts: number): number {
	return Math.min(15, 2 ** Math.max(0, Math.trunc(attempts) - 1))
}

export async function runProviderIncrementalAriSync(params: {
	providerId: string
	connectionId: string
	operation: string
	idempotencyKey: string
	payload: unknown
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	adapter?: ChannelManagerAdapter
	now?: Date
}) {
	const startedAt = Date.now()
	const payload = parseIncrementalAriJobPayload(params.payload)
	const runtime = params.adapter
		? null
		: await getProviderChannelManagerRuntime({
				providerId: params.providerId,
				connectionId: params.connectionId,
			})
	const adapter = params.adapter ?? runtime?.adapter
	if (!adapter) throw new Error("CHANNEL_MANAGER_ADAPTER_UNAVAILABLE")
	const connection =
		runtime?.connection ??
		(await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.id, params.connectionId),
					eq(ProviderIntegrationConnection.providerId, params.providerId)
				)
			)
			.then((rows) => rows[0]))
	const propertyId = String(connection?.externalPropertyId ?? "").trim()
	if (!propertyId) throw new Error("INCREMENTAL_ARI_PROPERTY_REQUIRED")
	const mappings = await listProviderIntegrationMappingsForConnection(params)
	const roomExternalByLocal = new Map(
		mappings
			.filter((row) => row.status === "active" && row.mappingType === "room_type")
			.map((row) => [row.localEntityId, row.externalEntityId])
	)
	const rateExternalByLocal = new Map(
		mappings
			.filter((row) => row.status === "active" && row.mappingType === "rate_plan")
			.map((row) => [row.localEntityId, row.externalEntityId])
	)
	const run = await startProviderIntegrationSyncRun({
		providerId: params.providerId,
		connectionId: params.connectionId,
		operation: params.operation,
		trigger: params.trigger ?? "webhook",
		idempotencyKey: params.idempotencyKey,
	})
	try {
		await enforceDomainRateLimit({
			connectionId: params.connectionId,
			operation: params.operation,
			now: params.now ?? new Date(),
		})
		const snapshot =
			payload.domain === "availability"
				? await buildAvailability({ payload, propertyId, roomExternalByLocal })
				: await buildRatesAndRestrictions({ payload, propertyId, rateExternalByLocal })
		const hash = stableHash({
			version: 1,
			domain: payload.domain,
			propertyId,
			values: snapshot.values,
		})
		const result =
			payload.domain === "availability"
				? await adapter.pushAvailability({
						values: snapshot.values as ChannelManagerAvailabilityUpdate[],
					})
				: await adapter.pushRatesAndRestrictions({
						values: snapshot.values as ChannelManagerRateRestrictionUpdate[],
					})
		const request = mutationSummary(result)
		const status = request.warned > 0 || request.rejected > 0 ? "partial" : "succeeded"
		const summary = {
			version: 1,
			kind: "incremental_ari_sync",
			domain: payload.domain,
			window: { from: payload.from, toExclusive: payload.toExclusive, days: snapshot.days },
			entities: snapshot.entities,
			request,
			snapshot: { algorithm: "sha256", hash },
		}
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status,
			readCount: snapshot.entities * snapshot.days,
			changedCount: request.accepted,
			skippedCount: request.warned,
			failedCount: request.rejected,
			summaryJson: summary,
		})
		await db
			.update(ProviderIntegrationConnection)
			.set({
				status: status === "succeeded" ? "connected" : "requires_attention",
				lastSyncAt: new Date(),
				lastAutomaticSyncAt: new Date(),
				lastSyncStatus:
					status === "succeeded" ? "incremental_ari_succeeded" : "incremental_ari_partial",
				errorMessage: status === "succeeded" ? null : "INCREMENTAL_ARI_PARTIAL",
				consecutiveFailures: status === "succeeded" ? 0 : 1,
				updatedAt: new Date(),
			})
			.where(eq(ProviderIntegrationConnection.id, params.connectionId))
		if (status === "partial") {
			await recordProviderIntegrationIncident({
				providerId: params.providerId,
				connectionId: params.connectionId,
				syncRunId: String(run.id),
				input: {
					dedupeKey: `incremental_ari_partial:${payload.domain}`,
					code: "INCREMENTAL_ARI_PARTIAL",
					category: "data_quality",
					severity: "warning",
					title: "Channex aceptó algunos cambios con observaciones",
					description: `${request.warned} cambios advertidos y ${request.rejected} rechazados.`,
					actionLabel: "Revisar incidencias",
					actionHref: "/provider/settings/integrations/incidents",
					entityType: "integration_connection",
					entityId: params.connectionId,
				},
			}).catch(() => undefined)
		}
		observeTiming(
			"provider_incremental_ari_end_to_end_ms",
			Date.now() - new Date(payload.queuedAt).getTime(),
			{ domain: payload.domain }
		)
		incrementCounter("provider_incremental_ari_runs_total", { domain: payload.domain, status })
		return { runId: String(run.id), status, summary }
	} catch (error) {
		const message = error instanceof Error ? error.message : "INCREMENTAL_ARI_SYNC_FAILED"
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status: "failed",
			failedCount: 1,
			errorCode: message.slice(0, 100),
			errorMessage: message,
		})
		incrementCounter("provider_incremental_ari_runs_total", {
			domain: payload.domain,
			status: "failed",
		})
		if (!(error instanceof ChannelManagerAdapterError && error.kind === "rate_limit")) {
			await db
				.update(ProviderIntegrationConnection)
				.set({
					status: "requires_attention",
					lastSyncAt: new Date(),
					lastSyncStatus: "incremental_ari_failed",
					errorMessage: message.slice(0, 1000),
					consecutiveFailures: sql`${ProviderIntegrationConnection.consecutiveFailures} + 1`,
					updatedAt: new Date(),
				})
				.where(eq(ProviderIntegrationConnection.id, params.connectionId))
		}
		throw error
	} finally {
		observeTiming("provider_incremental_ari_worker_ms", Date.now() - startedAt, {
			domain: payload.domain,
		})
	}
}
