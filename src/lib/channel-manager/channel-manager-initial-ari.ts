import { createHash } from "node:crypto"

import type {
	ChannelManagerAdapter,
	ChannelManagerAvailabilityUpdate,
	ChannelManagerMutationResult,
	ChannelManagerRateRestrictionUpdate,
} from "@/lib/channel-manager/channel-manager-adapter"
import { minStayUpdateForProperty } from "@/lib/channel-manager/channel-manager-restrictions"
import {
	finishProviderIntegrationSyncRun,
	recordProviderIntegrationIncident,
	startProviderIntegrationSyncRun,
} from "@/lib/provider-integration-operations"
import {
	getProviderChannelManagerPreflight,
	getProviderChannelManagerRuntime,
} from "@/lib/provider-integrations"
import {
	assertProviderIntegrationCertificationExecution,
	assertProviderIntegrationCertificationRunLink,
	getProviderAccountPurpose,
} from "@/lib/provider-integration-certification"
import { mapWithConcurrency } from "@/lib/provider-sync-job-queue"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"
import { recomputeEffectiveRestrictionsForVariantRange } from "@/modules/rules/public"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import {
	and,
	asc,
	db,
	desc,
	EffectiveAvailability,
	EffectivePricing,
	EffectiveRestriction,
	eq,
	gte,
	inArray,
	lt,
	ProviderIntegrationConnection,
	ProviderIntegrationCertification,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
} from "@/shared/infrastructure/db/compat"

export const INITIAL_ARI_DAYS = 500
export const INITIAL_ARI_OPERATION = "initial_ari_sync"
export const RECOVERY_FULL_SYNC_OPERATION = "recovery_full_sync"
export type FullAriSyncOperation =
	| typeof INITIAL_ARI_OPERATION
	| typeof RECOVERY_FULL_SYNC_OPERATION
const MATERIALIZATION_CONCURRENCY = 3
const CANONICAL_OCCUPANCY = { adults: 2, children: 0, infants: 0 } as const
const CANONICAL_OCCUPANCY_KEY = buildOccupancyKey(normalizeOccupancy(CANONICAL_OCCUPANCY))

export type InitialAriProgressStage =
	| "preflight"
	| "building_snapshot"
	| "sending_availability"
	| "sending_rates"
	| "completed"

export type InitialAriProgress = {
	stage: InitialAriProgressStage
	percent: number
	message: string
}

export type InitialAriSummary = {
	version: 2
	kind: "initial_ari_sync"
	environment: "sandbox" | "production"
	execution: {
		context: "commercial" | "certification"
		certificationId: string | null
		suiteVersion: string | null
		fixtureVersion: string | null
	}
	window: { from: string; to: string; days: number }
	counts: {
		rooms: number
		ratePlans: number
		days: number
		availabilityDays: number
		rateRestrictionDays: number
	}
	requests: {
		availability: InitialAriRequestSummary | null
		ratesAndRestrictions: InitialAriRequestSummary | null
	}
	totals: { submitted: number; accepted: number; warned: number; rejected: number }
	snapshot: { algorithm: "sha256"; hash: string }
}

type InitialAriRequestSummary = {
	taskIds: string[]
	requestIds: string[]
	submitted: number
	accepted: number
	warned: number
	rejected: number
	/** A compact, non-secret diagnostic sample. The commercial payload remains ephemeral. */
	warningSamples: Array<{
		code: string
		message: string
		itemIndex: number | null
		details: string | null
	}>
}

type AriSnapshot = {
	propertyId: string
	window: { from: string; to: string; toExclusive: string; days: number }
	availability: ChannelManagerAvailabilityUpdate[]
	ratesAndRestrictions: ChannelManagerRateRestrictionUpdate[]
	counts: InitialAriSummary["counts"]
	hash: string
}

type DailyAvailability = { date: string; availability: number }
type DailyRateRestriction = {
	date: string
	rate: string
	minStay: number
	maxStay: number
	closedToArrival: boolean
	closedToDeparture: boolean
	stopSell: boolean
}

function dateOnlyInTimezone(now: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now)
	const byType = new Map(parts.map((part) => [part.type, part.value]))
	return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`
}

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}

export function buildInitialAriWindow(now: Date, timezone: string) {
	const from = dateOnlyInTimezone(now, timezone)
	return {
		from,
		to: addDays(from, INITIAL_ARI_DAYS - 1),
		toExclusive: addDays(from, INITIAL_ARI_DAYS),
		days: INITIAL_ARI_DAYS,
	}
}

function normalizeDate(value: unknown): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	return String(value ?? "").slice(0, 10)
}

function stableHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function compressRanges<T extends { date: string }>(
	values: T[],
	equals: (left: T, right: T) => boolean
): Array<{ dateFrom: string; dateTo: string; value: T }> {
	if (!values.length) return []
	const result: Array<{ dateFrom: string; dateTo: string; value: T }> = []
	let first = values[0]
	let previous = values[0]
	for (const current of values.slice(1)) {
		if (equals(previous, current) && current.date === addDays(previous.date, 1)) {
			previous = current
			continue
		}
		result.push({ dateFrom: first.date, dateTo: previous.date, value: first })
		first = current
		previous = current
	}
	result.push({ dateFrom: first.date, dateTo: previous.date, value: first })
	return result
}

function requestSummary(result: ChannelManagerMutationResult): InitialAriRequestSummary {
	return {
		taskIds: result.taskIds,
		requestIds: result.requestIds,
		submitted: result.submitted,
		accepted: result.accepted,
		warned: result.warnings.length,
		rejected: result.rejected,
		warningSamples: result.warnings.slice(0, 25).map((warning) => ({
			code: warning.code,
			message: warning.message.slice(0, 500),
			itemIndex: warning.itemIndex,
			details:
				warning.details === undefined ? null : JSON.stringify(warning.details).slice(0, 2_000),
		})),
	}
}

function emptySummary(params: {
	environment: "sandbox" | "production"
	window: AriSnapshot["window"]
	counts: InitialAriSummary["counts"]
	hash: string
	execution: InitialAriSummary["execution"]
}): InitialAriSummary {
	return {
		version: 2,
		kind: "initial_ari_sync",
		environment: params.environment,
		execution: params.execution,
		window: { from: params.window.from, to: params.window.to, days: params.window.days },
		counts: params.counts,
		requests: { availability: null, ratesAndRestrictions: null },
		totals: { submitted: 0, accepted: 0, warned: 0, rejected: 0 },
		snapshot: { algorithm: "sha256", hash: params.hash },
	}
}

function finalizeSummary(summary: InitialAriSummary): InitialAriSummary {
	const requests = [summary.requests.availability, summary.requests.ratesAndRestrictions].filter(
		(value): value is InitialAriRequestSummary => Boolean(value)
	)
	return {
		...summary,
		totals: requests.reduce(
			(total, request) => ({
				submitted: total.submitted + request.submitted,
				accepted: total.accepted + request.accepted,
				warned: total.warned + request.warned,
				rejected: total.rejected + request.rejected,
			}),
			{ submitted: 0, accepted: 0, warned: 0, rejected: 0 }
		),
	}
}

function assertInitialAriRequestCount(summary: InitialAriSummary) {
	const availabilityRequests = summary.requests.availability?.requestIds.length ?? 0
	const rateRequests = summary.requests.ratesAndRestrictions?.requestIds.length ?? 0
	if (availabilityRequests !== 1 || rateRequests !== 1) {
		throw new Error("INITIAL_ARI_REQUEST_COUNT_INVALID")
	}
}

function assertCompleteDates(rows: Array<{ date: string }>, label: string) {
	const uniqueDates = new Set(rows.map((row) => row.date))
	if (rows.length !== INITIAL_ARI_DAYS || uniqueDates.size !== INITIAL_ARI_DAYS) {
		throw new Error(`INITIAL_ARI_CANONICAL_COVERAGE_INCOMPLETE:${label}`)
	}
}

export async function buildProviderInitialAriSnapshot(params: {
	providerId: string
	connectionId: string
	certificationId?: string | null
	now?: Date
}): Promise<AriSnapshot> {
	const context = await getProviderChannelManagerPreflight(params)
	if (!context.preflight.readyForExecution) {
		throw new Error(
			context.preflight.executionContext.kind === "certification"
				? "INTEGRATION_CERTIFICATION_PREFLIGHT_REQUIRED"
				: "INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED"
		)
	}
	if (context.connection.mode === "production" && !context.connection.syncEnabled) {
		throw new Error("INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED")
	}
	const propertyId = String(context.connection.externalPropertyId ?? "").trim()
	const property = context.properties.find((item) => item.id === propertyId)
	if (!property?.timezone || !property.currency) {
		throw new Error("INITIAL_ARI_PROPERTY_CONTEXT_REQUIRED")
	}
	const { from, to, toExclusive } = buildInitialAriWindow(
		params.now ?? new Date(),
		property.timezone
	)
	const activeMappings = context.mappings.filter((mapping) => mapping.status === "active")
	const rooms = context.localCatalog.variants.filter((item) =>
		context.preflight.executionContext.kind === "certification"
			? item.certificationEligible
			: item.sellable
	)
	const rates = context.localCatalog.ratePlans.filter((item) =>
		context.preflight.executionContext.kind === "certification"
			? item.certificationEligible
			: item.sellable
	)
	const roomExternalByLocal = new Map(
		activeMappings
			.filter((mapping) => mapping.mappingType === "room_type")
			.map((mapping) => [String(mapping.localEntityId), String(mapping.externalEntityId)])
	)
	const rateExternalByLocal = new Map(
		activeMappings
			.filter((mapping) => mapping.mappingType === "rate_plan")
			.map((mapping) => [String(mapping.localEntityId), String(mapping.externalEntityId)])
	)

	await mapWithConcurrency(rooms, MATERIALIZATION_CONCURRENCY, async (room) => {
		await recomputeEffectiveAvailabilityRange({
			variantId: room.id,
			from,
			to: toExclusive,
			reason: "channel_manager_initial_ari",
		})
		await recomputeEffectiveRestrictionsForVariantRange({
			variantId: room.id,
			from,
			to: toExclusive,
			reason: "channel_manager_initial_ari",
		})
	})
	await mapWithConcurrency(rates, MATERIALIZATION_CONCURRENCY, async (ratePlan) => {
		await ensurePricingCoverageRuntime({
			variantId: ratePlan.variantId,
			ratePlanId: ratePlan.id,
			from,
			to: toExclusive,
			occupancy: CANONICAL_OCCUPANCY,
			fallbackCurrency: property.currency ?? undefined,
			enqueueIncremental: false,
		})
	})

	const variantIds = rooms.map((item) => item.id)
	const ratePlanIds = rates.map((item) => item.id)
	const [availabilityRows, pricingRows, restrictionRows] = await Promise.all([
		db
			.select({
				variantId: EffectiveAvailability.variantId,
				date: EffectiveAvailability.date,
				availableUnits: EffectiveAvailability.availableUnits,
			})
			.from(EffectiveAvailability)
			.where(
				and(
					inArray(EffectiveAvailability.variantId, variantIds),
					gte(EffectiveAvailability.date, from),
					lt(EffectiveAvailability.date, toExclusive)
				)
			)
			.orderBy(asc(EffectiveAvailability.variantId), asc(EffectiveAvailability.date)),
		db
			.select({
				variantId: EffectivePricing.variantId,
				ratePlanId: EffectivePricing.ratePlanId,
				date: EffectivePricing.date,
				finalBasePrice: EffectivePricing.finalBasePrice,
				currency: EffectivePricing.currency,
			})
			.from(EffectivePricing)
			.where(
				and(
					inArray(EffectivePricing.ratePlanId, ratePlanIds),
					eq(EffectivePricing.occupancyKey, CANONICAL_OCCUPANCY_KEY),
					gte(EffectivePricing.date, from),
					lt(EffectivePricing.date, toExclusive)
				)
			)
			.orderBy(asc(EffectivePricing.ratePlanId), asc(EffectivePricing.date)),
		db
			.select({
				variantId: EffectiveRestriction.variantId,
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
					gte(EffectiveRestriction.date, from),
					lt(EffectiveRestriction.date, toExclusive)
				)
			)
			.orderBy(asc(EffectiveRestriction.ratePlanId), asc(EffectiveRestriction.date)),
	])

	const availability: ChannelManagerAvailabilityUpdate[] = []
	for (const room of rooms) {
		const daily: DailyAvailability[] = availabilityRows
			.filter((row) => row.variantId === room.id)
			.map((row) => ({
				date: normalizeDate(row.date),
				availability: Math.max(0, Number(row.availableUnits ?? 0)),
			}))
		assertCompleteDates(daily, `availability:${room.id}`)
		for (const range of compressRanges(
			daily,
			(left, right) => left.availability === right.availability
		)) {
			availability.push({
				propertyId,
				roomTypeId: roomExternalByLocal.get(room.id) ?? "",
				dateFrom: range.dateFrom,
				dateTo: range.dateTo,
				availability: range.value.availability,
			})
		}
	}

	const ratesAndRestrictions: ChannelManagerRateRestrictionUpdate[] = []
	for (const ratePlan of rates) {
		const prices = new Map(
			pricingRows
				.filter((row) => row.ratePlanId === ratePlan.id)
				.map((row) => [normalizeDate(row.date), row])
		)
		const restrictions = new Map(
			restrictionRows
				.filter((row) => row.ratePlanId === ratePlan.id)
				.map((row) => [normalizeDate(row.date), row])
		)
		const daily: DailyRateRestriction[] = []
		for (let offset = 0; offset < INITIAL_ARI_DAYS; offset += 1) {
			const date = addDays(from, offset)
			const price = prices.get(date)
			const restriction = restrictions.get(date)
			const numericPrice = Number(price?.finalBasePrice)
			if (!price || !Number.isFinite(numericPrice) || numericPrice <= 0) {
				throw new Error(`INITIAL_ARI_PRICE_INVALID:${ratePlan.id}:${date}`)
			}
			if (String(price.currency).toUpperCase() !== String(property.currency).toUpperCase()) {
				throw new Error(`INITIAL_ARI_PRICE_CURRENCY_MISMATCH:${ratePlan.id}:${date}`)
			}
			if (!restriction) {
				throw new Error(`INITIAL_ARI_RESTRICTION_MISSING:${ratePlan.id}:${date}`)
			}
			daily.push({
				date,
				rate: numericPrice.toFixed(2),
				minStay: Math.max(1, Number(restriction.minStay ?? 1)),
				maxStay: Math.max(0, Number(restriction.maxStay ?? 0)),
				closedToArrival: Boolean(restriction.cta),
				closedToDeparture: Boolean(restriction.ctd),
				stopSell: Boolean(restriction.stopSell),
			})
		}
		assertCompleteDates(daily, `rates:${ratePlan.id}`)
		for (const range of compressRanges(
			daily,
			(left, right) =>
				left.rate === right.rate &&
				left.minStay === right.minStay &&
				left.maxStay === right.maxStay &&
				left.closedToArrival === right.closedToArrival &&
				left.closedToDeparture === right.closedToDeparture &&
				left.stopSell === right.stopSell
		)) {
			ratesAndRestrictions.push({
				propertyId,
				ratePlanId: rateExternalByLocal.get(ratePlan.id) ?? "",
				dateFrom: range.dateFrom,
				dateTo: range.dateTo,
				rate: range.value.rate,
				...minStayUpdateForProperty(range.value.minStay, property.minStayType),
				maxStay: range.value.maxStay,
				closedToArrival: range.value.closedToArrival,
				closedToDeparture: range.value.closedToDeparture,
				stopSell: range.value.stopSell,
			})
		}
	}

	if (availability.some((value) => !value.roomTypeId)) {
		throw new Error("INITIAL_ARI_ROOM_MAPPING_REQUIRED")
	}
	if (ratesAndRestrictions.some((value) => !value.ratePlanId)) {
		throw new Error("INITIAL_ARI_RATE_MAPPING_REQUIRED")
	}
	const hash = stableHash({
		version: 1,
		propertyId,
		window: { from, to, days: INITIAL_ARI_DAYS },
		availability,
		ratesAndRestrictions,
	})
	return {
		propertyId,
		window: { from, to, toExclusive, days: INITIAL_ARI_DAYS },
		availability,
		ratesAndRestrictions,
		counts: {
			rooms: rooms.length,
			ratePlans: rates.length,
			days: INITIAL_ARI_DAYS,
			availabilityDays: rooms.length * INITIAL_ARI_DAYS,
			rateRestrictionDays: rates.length * INITIAL_ARI_DAYS,
		},
		hash,
	}
}

export async function runProviderInitialAriSync(params: {
	providerId: string
	connectionId: string
	certificationId?: string | null
	requestedBy?: string | null
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	idempotencyKey: string
	onProgress?: (progress: InitialAriProgress) => Promise<void>
	adapter?: ChannelManagerAdapter
	operation?: FullAriSyncOperation
}) {
	const startedAtMs = Date.now()
	const accountPurpose = await getProviderAccountPurpose(params.providerId)
	const certificationId = String(params.certificationId ?? "").trim() || null
	let certificationEvidence: {
		id: string
		suiteVersion: string | null
		evidenceManifestJson: unknown
	} | null = null
	if (accountPurpose === "integration_certification") {
		if (!certificationId) throw new Error("INTEGRATION_CERTIFICATION_ID_REQUIRED")
		if (params.requestedBy) {
			const authorization = await assertProviderIntegrationCertificationExecution({
				providerId: params.providerId,
				connectionId: params.connectionId,
				certificationId,
				userId: params.requestedBy,
			})
			certificationEvidence = authorization.certification
		} else {
			const link = await assertProviderIntegrationCertificationRunLink({
				providerId: params.providerId,
				connectionId: params.connectionId,
				certificationId,
			})
			certificationEvidence = link.certification
		}
	} else if (certificationId) {
		throw new Error("CERTIFICATION_PROVIDER_REQUIRED")
	}
	const progress = async (value: InitialAriProgress) => params.onProgress?.(value)
	await progress({ stage: "preflight", percent: 8, message: "Validando acceso y cobertura" })
	const runtime = params.adapter
		? null
		: await getProviderChannelManagerRuntime({
				providerId: params.providerId,
				currentUserId: params.requestedBy,
				connectionId: params.connectionId,
			})
	const adapter = params.adapter ?? runtime?.adapter
	if (!adapter) throw new Error("CHANNEL_MANAGER_ADAPTER_UNAVAILABLE")
	const environment = runtime?.mode ?? "sandbox"
	const telemetry = {
		vendor: runtime?.vendorKey ?? "test_adapter",
		environment,
		operation: params.operation ?? INITIAL_ARI_OPERATION,
		execution_context: certificationEvidence ? "certification" : "commercial",
	}
	const run = await startProviderIntegrationSyncRun({
		providerId: params.providerId,
		connectionId: params.connectionId,
		certificationId,
		operation: params.operation ?? INITIAL_ARI_OPERATION,
		trigger: params.trigger ?? "manual",
		requestedBy: params.requestedBy,
		idempotencyKey: params.idempotencyKey,
	})
	if (certificationId) {
		await db
			.update(ProviderIntegrationCertification)
			.set({ status: "running", updatedAt: new Date() })
			.where(eq(ProviderIntegrationCertification.id, certificationId))
	}
	let summary: InitialAriSummary | null = null
	try {
		await progress({
			stage: "building_snapshot",
			percent: 22,
			message: "Preparando 500 días de inventario y tarifas",
		})
		const snapshot = await buildProviderInitialAriSnapshot(params)
		summary = emptySummary({
			environment,
			...snapshot,
			execution: {
				context: certificationEvidence ? "certification" : "commercial",
				certificationId,
				suiteVersion: String(certificationEvidence?.suiteVersion ?? "").trim() || null,
				fixtureVersion:
					certificationEvidence?.evidenceManifestJson &&
					typeof certificationEvidence.evidenceManifestJson === "object"
						? String(
								(certificationEvidence.evidenceManifestJson as Record<string, unknown>)
									.fixtureVersion ?? ""
							).trim() || null
						: null,
			},
		})
		await progress({
			stage: "sending_availability",
			percent: 62,
			message: "Enviando disponibilidad por habitación",
		})
		const availability = await adapter.pushAvailability({ values: snapshot.availability })
		summary.requests.availability = requestSummary(availability)
		incrementCounter("provider_initial_ari_requests_total", {
			...telemetry,
			stream: "availability",
		})
		incrementCounter(
			"provider_initial_ari_task_ids_total",
			{ ...telemetry, stream: "availability" },
			availability.taskIds.length
		)
		await progress({
			stage: "sending_rates",
			percent: 82,
			message: "Enviando tarifas y restricciones",
		})
		const rates = await adapter.pushRatesAndRestrictions({
			values: snapshot.ratesAndRestrictions,
		})
		summary.requests.ratesAndRestrictions = requestSummary(rates)
		incrementCounter("provider_initial_ari_requests_total", {
			...telemetry,
			stream: "rates_and_restrictions",
		})
		incrementCounter(
			"provider_initial_ari_task_ids_total",
			{ ...telemetry, stream: "rates_and_restrictions" },
			rates.taskIds.length
		)
		summary = finalizeSummary(summary)
		assertInitialAriRequestCount(summary)
		const status =
			summary.totals.warned > 0 || summary.totals.rejected > 0 ? "partial" : "succeeded"
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status,
			readCount: snapshot.counts.availabilityDays + snapshot.counts.rateRestrictionDays,
			changedCount: summary.totals.accepted,
			skippedCount: summary.totals.warned,
			failedCount: summary.totals.rejected,
			summaryJson: summary,
		})
		if (status === "partial") {
			if (certificationId) {
				await db
					.update(ProviderIntegrationCertification)
					.set({ status: "requires_attention", updatedAt: new Date() })
					.where(eq(ProviderIntegrationCertification.id, certificationId))
			}
			await recordProviderIntegrationIncident({
				providerId: params.providerId,
				connectionId: params.connectionId,
				syncRunId: String(run.id),
				input: {
					dedupeKey: "initial_ari_partial",
					code: "INITIAL_ARI_PARTIAL",
					category: "data_quality",
					severity: "warning",
					title: "Channex aceptó la sincronización con advertencias",
					description: `${summary.totals.warned} elementos advertidos y ${summary.totals.rejected} rechazados.`,
					actionLabel: "Revisar conexión",
					actionHref: `/provider/settings/integrations/connections/${params.connectionId}`,
					entityType: "integration_connection",
					entityId: params.connectionId,
					metadataJson: { snapshotHash: summary.snapshot.hash, totals: summary.totals },
				},
			}).catch(() => undefined)
		}
		await db
			.update(ProviderIntegrationConnection)
			.set({
				status: status === "succeeded" ? "connected" : "requires_attention",
				lastSyncAt: new Date(),
				lastSyncStatus: status === "succeeded" ? "initial_ari_succeeded" : "initial_ari_partial",
				errorMessage: status === "succeeded" ? null : "INITIAL_ARI_PARTIAL",
				consecutiveFailures: status === "succeeded" ? 0 : 1,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(ProviderIntegrationConnection.id, params.connectionId),
					eq(ProviderIntegrationConnection.providerId, params.providerId)
				)
			)
		await progress({ stage: "completed", percent: 100, message: "Sincronización completada" })
		incrementCounter("provider_initial_ari_runs_total", { ...telemetry, status })
		observeTiming("provider_initial_ari_duration_ms", Date.now() - startedAtMs, {
			...telemetry,
			status,
		})
		return { runId: String(run.id), status, summary }
	} catch (error) {
		const message = error instanceof Error ? error.message : "INITIAL_ARI_SYNC_FAILED"
		const compactSummary = summary ? finalizeSummary(summary) : null
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status: compactSummary?.requests.availability ? "partial" : "failed",
			changedCount: compactSummary?.totals.accepted ?? 0,
			skippedCount: compactSummary?.totals.warned ?? 0,
			failedCount: Math.max(1, compactSummary?.totals.rejected ?? 0),
			errorCode: message.slice(0, 100),
			errorMessage: message,
			summaryJson: compactSummary,
		})
		await db
			.update(ProviderIntegrationConnection)
			.set({
				status: "requires_attention",
				lastSyncAt: new Date(),
				lastSyncStatus: "initial_ari_failed",
				errorMessage: message.slice(0, 1000),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(ProviderIntegrationConnection.id, params.connectionId),
					eq(ProviderIntegrationConnection.providerId, params.providerId)
				)
			)
		if (certificationId) {
			await db
				.update(ProviderIntegrationCertification)
				.set({ status: "requires_attention", updatedAt: new Date() })
				.where(eq(ProviderIntegrationCertification.id, certificationId))
		}
		await recordProviderIntegrationIncident({
			providerId: params.providerId,
			connectionId: params.connectionId,
			syncRunId: String(run.id),
			input: {
				dedupeKey: "initial_ari_failed",
				code: message.slice(0, 100),
				category:
					message.includes("PREFLIGHT") || message.includes("MAPPING") ? "mapping" : "remote_api",
				severity: "error",
				title: "La sincronización inicial no se completó",
				description: "Fastt detuvo o no pudo completar el envío inicial de datos comerciales.",
				actionLabel: "Revisar conexión",
				actionHref: `/provider/settings/integrations/connections/${params.connectionId}`,
				entityType: "integration_connection",
				entityId: params.connectionId,
				metadataJson: { snapshotHash: compactSummary?.snapshot.hash ?? null },
			},
		}).catch(() => undefined)
		incrementCounter("provider_initial_ari_runs_total", { ...telemetry, status: "failed" })
		observeTiming("provider_initial_ari_duration_ms", Date.now() - startedAtMs, {
			...telemetry,
			status: "failed",
		})
		throw error
	}
}

export async function enqueueProviderInitialAriSync(params: {
	providerId: string
	connectionId: string
	requestedBy: string
	certificationId?: string | null
}) {
	const accountPurpose = await getProviderAccountPurpose(params.providerId)
	const certificationId = String(params.certificationId ?? "").trim() || null
	if (accountPurpose === "integration_certification") {
		if (!certificationId) throw new Error("INTEGRATION_CERTIFICATION_ID_REQUIRED")
		await assertProviderIntegrationCertificationExecution({
			providerId: params.providerId,
			connectionId: params.connectionId,
			certificationId,
			userId: params.requestedBy,
		})
	} else if (certificationId) {
		throw new Error("CERTIFICATION_PROVIDER_REQUIRED")
	}
	const context = await getProviderChannelManagerPreflight({ ...params, certificationId })
	if (!context.preflight.readyForExecution) {
		throw new Error(
			context.preflight.executionContext.kind === "certification"
				? "INTEGRATION_CERTIFICATION_PREFLIGHT_REQUIRED"
				: "INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED"
		)
	}
	const existing = await db
		.select({ id: ProviderIntegrationSyncJob.id, status: ProviderIntegrationSyncJob.status })
		.from(ProviderIntegrationSyncJob)
		.where(
			and(
				eq(ProviderIntegrationSyncJob.providerId, params.providerId),
				eq(ProviderIntegrationSyncJob.connectionId, params.connectionId),
				eq(ProviderIntegrationSyncJob.operation, INITIAL_ARI_OPERATION),
				inArray(ProviderIntegrationSyncJob.status, ["queued", "running"])
			)
		)
		.orderBy(desc(ProviderIntegrationSyncJob.createdAt))
		.then((rows) => rows[0])
	if (existing) return { ...existing, created: false }
	const now = new Date()
	const lastFullSync = await db
		.select({ id: ProviderIntegrationSyncRun.id })
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.providerId, params.providerId),
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
				eq(ProviderIntegrationSyncRun.operation, INITIAL_ARI_OPERATION),
				inArray(
					ProviderIntegrationSyncRun.status,
					accountPurpose === "integration_certification" ? ["succeeded"] : ["succeeded", "partial"]
				),
				gte(ProviderIntegrationSyncRun.startedAt, new Date(now.getTime() - 86_400_000))
			)
		)
		.then((rows) => rows[0] ?? null)
	if (lastFullSync) throw new Error("INITIAL_ARI_DAILY_LIMIT")
	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationSyncJob).values({
		id,
		providerId: params.providerId,
		connectionId: params.connectionId,
		targetType: "connection",
		targetId: params.connectionId,
		connectorKey: "channel_manager",
		operation: INITIAL_ARI_OPERATION,
		status: "queued",
		trigger: "manual",
		priority: 10,
		attempts: 0,
		maxAttempts: 3,
		runAfter: now,
		idempotencyKey: `initial-ari:${params.connectionId}:${id}`,
		payloadJson: {
			requestedBy: params.requestedBy,
			certificationId: String(params.certificationId ?? "").trim() || null,
			stage: "preflight",
			percent: 0,
			message: "Esperando al worker de sincronización",
		},
		createdAt: now,
		updatedAt: now,
	})
	return { id, status: "queued", created: true }
}

export async function enqueueProviderRecoveryFullSync(params: {
	providerId: string
	connectionId: string
	requestedBy: string
}) {
	const context = await getProviderChannelManagerPreflight(params)
	if (!context.preflight.readyForProduction) {
		throw new Error("INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED")
	}
	const completedInitial = await db
		.select({ id: ProviderIntegrationSyncRun.id })
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.providerId, params.providerId),
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
				inArray(ProviderIntegrationSyncRun.operation, [
					INITIAL_ARI_OPERATION,
					RECOVERY_FULL_SYNC_OPERATION,
				]),
				inArray(ProviderIntegrationSyncRun.status, ["succeeded", "partial"])
			)
		)
		.then((rows) => rows[0] ?? null)
	if (!completedInitial) throw new Error("RECOVERY_FULL_SYNC_INITIAL_REQUIRED")
	const active = await db
		.select({ id: ProviderIntegrationSyncJob.id, status: ProviderIntegrationSyncJob.status })
		.from(ProviderIntegrationSyncJob)
		.where(
			and(
				eq(ProviderIntegrationSyncJob.providerId, params.providerId),
				eq(ProviderIntegrationSyncJob.connectionId, params.connectionId),
				inArray(ProviderIntegrationSyncJob.operation, [
					INITIAL_ARI_OPERATION,
					RECOVERY_FULL_SYNC_OPERATION,
				]),
				inArray(ProviderIntegrationSyncJob.status, ["queued", "running"])
			)
		)
		.orderBy(desc(ProviderIntegrationSyncJob.createdAt))
		.then((rows) => rows[0] ?? null)
	if (active) return { ...active, created: false }

	const now = new Date()
	const recentRecovery = await db
		.select({ id: ProviderIntegrationSyncRun.id })
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.providerId, params.providerId),
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
				eq(ProviderIntegrationSyncRun.operation, RECOVERY_FULL_SYNC_OPERATION),
				gte(ProviderIntegrationSyncRun.startedAt, new Date(now.getTime() - 15 * 60_000))
			)
		)
		.then((rows) => rows[0] ?? null)
	if (recentRecovery) throw new Error("RECOVERY_FULL_SYNC_COOLDOWN")

	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationSyncJob).values({
		id,
		providerId: params.providerId,
		connectionId: params.connectionId,
		targetType: "connection",
		targetId: params.connectionId,
		connectorKey: "channel_manager",
		operation: RECOVERY_FULL_SYNC_OPERATION,
		status: "queued",
		trigger: "manual",
		priority: 8,
		attempts: 0,
		maxAttempts: 3,
		runAfter: now,
		idempotencyKey: `recovery-full:${params.connectionId}:${id}`,
		payloadJson: {
			requestedBy: params.requestedBy,
			stage: "preflight",
			percent: 0,
			message: "Esperando al worker de recuperación",
		},
		createdAt: now,
		updatedAt: now,
	})
	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.requestedBy,
		action: "provider.integration.recovery_full_sync.queued",
		entityType: "ProviderIntegrationConnection",
		entityId: params.connectionId,
		beforeJson: null,
		afterJson: { jobId: id, operation: RECOVERY_FULL_SYNC_OPERATION },
		riskLevel: "high",
	})
	return { id, status: "queued", created: true }
}

export async function getProviderInitialAriStatus(params: {
	providerId: string
	connectionId: string
}) {
	const connection = await db
		.select({ id: ProviderIntegrationConnection.id, mode: ProviderIntegrationConnection.mode })
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, params.connectionId),
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager")
			)
		)
		.then((rows) => rows[0])
	if (!connection) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	const [job, run] = await Promise.all([
		db
			.select({
				id: ProviderIntegrationSyncJob.id,
				status: ProviderIntegrationSyncJob.status,
				attempts: ProviderIntegrationSyncJob.attempts,
				maxAttempts: ProviderIntegrationSyncJob.maxAttempts,
				lastError: ProviderIntegrationSyncJob.lastError,
				payloadJson: ProviderIntegrationSyncJob.payloadJson,
				updatedAt: ProviderIntegrationSyncJob.updatedAt,
			})
			.from(ProviderIntegrationSyncJob)
			.where(
				and(
					eq(ProviderIntegrationSyncJob.providerId, params.providerId),
					eq(ProviderIntegrationSyncJob.connectionId, params.connectionId),
					inArray(ProviderIntegrationSyncJob.operation, [
						INITIAL_ARI_OPERATION,
						RECOVERY_FULL_SYNC_OPERATION,
					])
				)
			)
			.orderBy(desc(ProviderIntegrationSyncJob.createdAt))
			.then((rows) => rows[0] ?? null),
		db
			.select({
				id: ProviderIntegrationSyncRun.id,
				status: ProviderIntegrationSyncRun.status,
				summaryJson: ProviderIntegrationSyncRun.summaryJson,
				errorMessage: ProviderIntegrationSyncRun.errorMessage,
				startedAt: ProviderIntegrationSyncRun.startedAt,
				finishedAt: ProviderIntegrationSyncRun.finishedAt,
			})
			.from(ProviderIntegrationSyncRun)
			.where(
				and(
					eq(ProviderIntegrationSyncRun.providerId, params.providerId),
					eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
					inArray(ProviderIntegrationSyncRun.operation, [
						INITIAL_ARI_OPERATION,
						RECOVERY_FULL_SYNC_OPERATION,
					])
				)
			)
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.then((rows) => rows[0] ?? null),
	])
	return { environment: connection.mode, job, run }
}
