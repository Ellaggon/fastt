import { logger } from "@/lib/observability/logger"
import {
	providerIntegrationCertificationScenarioKeys,
	type ProviderIntegrationCertificationScenarioKey,
} from "@/lib/provider-integration-certification"
import { incrementCounter } from "@/lib/observability/metrics"
import {
	and,
	db,
	eq,
	inArray,
	ProviderIntegrationConnection,
	ProviderIntegrationMapping,
	sql,
} from "@/shared/infrastructure/db/compat"

export const INCREMENTAL_AVAILABILITY_OPERATION = "incremental_availability_sync"
export const INCREMENTAL_RATES_OPERATION = "incremental_rates_restrictions_sync"

export type IncrementalAriDomain = "availability" | "rates_restrictions"

export type IncrementalAriJobPayload = {
	version: 1
	domain: IncrementalAriDomain
	from: string
	toExclusive: string
	variantIds: string[]
	ratePlanIds: string[]
	queuedAt: string
	certificationId: string | null
	certificationScenario: ProviderIntegrationCertificationScenarioKey | null
}

function uniqueIds(values: string[] | undefined): string[] {
	return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))]
}

function nextMinute(now: Date): Date {
	const value = new Date(now)
	value.setUTCSeconds(0, 0)
	value.setUTCMinutes(value.getUTCMinutes() + 1)
	return value
}

function validDateOnly(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function buildIncrementalAriHorizon(now = new Date(), days = 500) {
	const from = now.toISOString().slice(0, 10)
	const end = new Date(`${from}T00:00:00.000Z`)
	end.setUTCDate(end.getUTCDate() + Math.max(1, Math.trunc(days)))
	return { from, toExclusive: end.toISOString().slice(0, 10) }
}

export function incrementalAriOperation(domain: IncrementalAriDomain): string {
	return domain === "availability"
		? INCREMENTAL_AVAILABILITY_OPERATION
		: INCREMENTAL_RATES_OPERATION
}

export function parseIncrementalAriJobPayload(value: unknown): IncrementalAriJobPayload {
	const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
	const domain = input.domain === "availability" ? "availability" : "rates_restrictions"
	const from = String(input.from ?? "")
	const toExclusive = String(input.toExclusive ?? "")
	if (!validDateOnly(from) || !validDateOnly(toExclusive) || toExclusive <= from) {
		throw new Error("INCREMENTAL_ARI_DATE_RANGE_INVALID")
	}
	return {
		version: 1,
		domain,
		from,
		toExclusive,
		variantIds: uniqueIds(Array.isArray(input.variantIds) ? input.variantIds.map(String) : []),
		ratePlanIds: uniqueIds(Array.isArray(input.ratePlanIds) ? input.ratePlanIds.map(String) : []),
		queuedAt: String(input.queuedAt ?? new Date().toISOString()),
		certificationId: String(input.certificationId ?? "").trim() || null,
		certificationScenario: (
			providerIntegrationCertificationScenarioKeys as readonly string[]
		).includes(String(input.certificationScenario ?? "").trim())
			? (String(input.certificationScenario).trim() as ProviderIntegrationCertificationScenarioKey)
			: null,
	}
}

export async function enqueueProviderIncrementalAriChange(params: {
	domain: IncrementalAriDomain
	variantIds?: string[]
	ratePlanIds?: string[]
	from: string
	toExclusive: string
	now?: Date
	certificationId?: string | null
	certificationScenario?: ProviderIntegrationCertificationScenarioKey | null
	/** Stable scope for a durable bulk finalizer. It yields one ARI operation per connection. */
	idempotencyScope?: string
}): Promise<{ connections: number; jobs: number }> {
	const variantIds = uniqueIds(params.variantIds)
	const ratePlanIds = uniqueIds(params.ratePlanIds)
	if (!variantIds.length && !ratePlanIds.length) return { connections: 0, jobs: 0 }
	if (
		!validDateOnly(params.from) ||
		!validDateOnly(params.toExclusive) ||
		params.toExclusive <= params.from
	) {
		throw new Error("INCREMENTAL_ARI_DATE_RANGE_INVALID")
	}
	const mappingType = params.domain === "availability" ? "room_type" : "rate_plan"
	const localIds = params.domain === "availability" ? variantIds : ratePlanIds
	if (!localIds.length) return { connections: 0, jobs: 0 }
	const connections = await db
		.selectDistinct({
			id: ProviderIntegrationConnection.id,
			providerId: ProviderIntegrationConnection.providerId,
		})
		.from(ProviderIntegrationMapping)
		.innerJoin(
			ProviderIntegrationConnection,
			eq(ProviderIntegrationConnection.id, ProviderIntegrationMapping.connectionId)
		)
		.where(
			and(
				eq(ProviderIntegrationMapping.mappingType, mappingType),
				eq(ProviderIntegrationMapping.status, "active"),
				inArray(ProviderIntegrationMapping.localEntityId, localIds),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager"),
				sql`${ProviderIntegrationConnection.status} <> 'revoked'`,
				sql`${ProviderIntegrationConnection.lastSyncStatus} IN ('initial_ari_succeeded', 'incremental_ari_succeeded', 'incremental_ari_partial')`,
				eq(ProviderIntegrationConnection.syncEnabled, true)
			)
		)
	const now = params.now ?? new Date()
	const runAfter = nextMinute(now)
	const operation = incrementalAriOperation(params.domain)
	const payload: IncrementalAriJobPayload = {
		version: 1,
		domain: params.domain,
		from: params.from,
		toExclusive: params.toExclusive,
		variantIds,
		ratePlanIds,
		queuedAt: now.toISOString(),
		certificationId: String(params.certificationId ?? "").trim() || null,
		certificationScenario: params.certificationScenario ?? null,
	}
	let jobs = 0
	for (const connection of connections) {
		if (params.idempotencyScope) {
			const key = `${params.idempotencyScope}:${operation}:${connection.id}`
			const rows = await db.execute(sql`
				INSERT INTO "ProviderIntegrationSyncJob" (
					"id", "providerId", "connectionId", "targetType", "targetId", "connectorKey",
					"operation", "status", "trigger", "priority", "attempts", "maxAttempts",
					"runAfter", "idempotencyKey", "payloadJson", "createdAt", "updatedAt"
				) VALUES (
					gen_random_uuid()::text, ${connection.providerId}, ${connection.id}, 'connection', ${connection.id},
					'channel_manager', ${operation}, 'queued', 'webhook', 20, 0, 8,
					${runAfter.toISOString()}, ${key}, ${JSON.stringify(payload)}::jsonb, ${now.toISOString()}, ${now.toISOString()}
				)
				ON CONFLICT ("targetType", "targetId", "idempotencyKey") DO UPDATE SET
					"payloadJson" = jsonb_build_object(
						'version', 1,
						'domain', EXCLUDED."payloadJson"->>'domain',
						'from', LEAST("ProviderIntegrationSyncJob"."payloadJson"->>'from', EXCLUDED."payloadJson"->>'from'),
						'toExclusive', GREATEST("ProviderIntegrationSyncJob"."payloadJson"->>'toExclusive', EXCLUDED."payloadJson"->>'toExclusive'),
						'variantIds', (
							SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
							FROM jsonb_array_elements_text(COALESCE("ProviderIntegrationSyncJob"."payloadJson"->'variantIds', '[]'::jsonb) || COALESCE(EXCLUDED."payloadJson"->'variantIds', '[]'::jsonb)) AS identities(value)
						),
						'ratePlanIds', (
							SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
							FROM jsonb_array_elements_text(COALESCE("ProviderIntegrationSyncJob"."payloadJson"->'ratePlanIds', '[]'::jsonb) || COALESCE(EXCLUDED."payloadJson"->'ratePlanIds', '[]'::jsonb)) AS identities(value)
						),
						'queuedAt', LEAST("ProviderIntegrationSyncJob"."payloadJson"->>'queuedAt', EXCLUDED."payloadJson"->>'queuedAt'),
						'certificationId', COALESCE(EXCLUDED."payloadJson"->'certificationId', "ProviderIntegrationSyncJob"."payloadJson"->'certificationId'),
						'certificationScenario', COALESCE(EXCLUDED."payloadJson"->'certificationScenario', "ProviderIntegrationSyncJob"."payloadJson"->'certificationScenario')
					),
					"updatedAt" = EXCLUDED."updatedAt"
				WHERE "ProviderIntegrationSyncJob"."status" = 'queued'
				RETURNING "id"
			`)
			if (Array.from(rows as unknown as Array<{ id: string }>).length > 0) jobs += 1
			continue
		}
		for (let spill = 0; spill < 2; spill += 1) {
			const scheduledAt = new Date(runAfter.getTime() + spill * 60_000)
			const key = `incremental-ari:${operation}:${scheduledAt.toISOString()}`
			const rows = await db.execute(sql`
				INSERT INTO "ProviderIntegrationSyncJob" (
				"id", "providerId", "connectionId", "targetType", "targetId", "connectorKey",
				"operation", "status", "trigger", "priority", "attempts", "maxAttempts",
				"runAfter", "idempotencyKey", "payloadJson", "createdAt", "updatedAt"
			) VALUES (
				gen_random_uuid()::text, ${connection.providerId}, ${connection.id}, 'connection', ${connection.id},
				'channel_manager', ${operation}, 'queued', 'webhook', 20, 0, 8,
					${scheduledAt.toISOString()}, ${key}, ${JSON.stringify(payload)}::jsonb, ${now.toISOString()}, ${now.toISOString()}
			)
			ON CONFLICT ("targetType", "targetId", "idempotencyKey") DO UPDATE SET
				"payloadJson" = jsonb_build_object(
					'version', 1,
					'domain', EXCLUDED."payloadJson"->>'domain',
					'from', LEAST("ProviderIntegrationSyncJob"."payloadJson"->>'from', EXCLUDED."payloadJson"->>'from'),
					'toExclusive', GREATEST("ProviderIntegrationSyncJob"."payloadJson"->>'toExclusive', EXCLUDED."payloadJson"->>'toExclusive'),
					'variantIds', COALESCE("ProviderIntegrationSyncJob"."payloadJson"->'variantIds', '[]'::jsonb) || COALESCE(EXCLUDED."payloadJson"->'variantIds', '[]'::jsonb),
					'ratePlanIds', COALESCE("ProviderIntegrationSyncJob"."payloadJson"->'ratePlanIds', '[]'::jsonb) || COALESCE(EXCLUDED."payloadJson"->'ratePlanIds', '[]'::jsonb),
					'queuedAt', LEAST("ProviderIntegrationSyncJob"."payloadJson"->>'queuedAt', EXCLUDED."payloadJson"->>'queuedAt'),
					'certificationId', COALESCE(EXCLUDED."payloadJson"->'certificationId', "ProviderIntegrationSyncJob"."payloadJson"->'certificationId'),
					'certificationScenario', COALESCE(EXCLUDED."payloadJson"->'certificationScenario', "ProviderIntegrationSyncJob"."payloadJson"->'certificationScenario')
				),
				"updatedAt" = EXCLUDED."updatedAt"
			WHERE "ProviderIntegrationSyncJob"."status" = 'queued'
				RETURNING "id"
			`)
			if (Array.from(rows as unknown as Array<{ id: string }>).length > 0) {
				jobs += 1
				break
			}
		}
	}
	if (jobs > 0) {
		incrementCounter("provider_incremental_ari_jobs_enqueued_total", {
			domain: params.domain,
		})
	}
	return { connections: connections.length, jobs }
}

export async function enqueueProviderIncrementalAriChangeSoft(
	params: Parameters<typeof enqueueProviderIncrementalAriChange>[0]
): Promise<void> {
	try {
		await enqueueProviderIncrementalAriChange(params)
	} catch (error) {
		logger.warn("channel_manager.incremental_ari.enqueue_failed", {
			domain: params.domain,
			variantIds: params.variantIds?.length ?? 0,
			ratePlanIds: params.ratePlanIds?.length ?? 0,
			from: params.from,
			toExclusive: params.toExclusive,
			message: error instanceof Error ? error.message : String(error),
		})
	}
}
