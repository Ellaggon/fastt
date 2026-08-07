import {
	INITIAL_ARI_OPERATION,
	RECOVERY_FULL_SYNC_OPERATION,
	enqueueProviderRecoveryFullSync,
} from "@/lib/channel-manager/channel-manager-initial-ari"
import { BOOKING_REVISION_FEED_OPERATION } from "@/lib/channel-manager/channel-manager-booking-revisions"
import {
	INCREMENTAL_AVAILABILITY_OPERATION,
	INCREMENTAL_RATES_OPERATION,
} from "@/lib/channel-manager/channel-manager-incremental-queue"
import {
	and,
	db,
	eq,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	sql,
} from "@/shared/infrastructure/db/compat"
import { writeProviderAuditLog } from "@/lib/provider-audit"

const RETRYABLE_OPERATIONS = new Set([
	INITIAL_ARI_OPERATION,
	RECOVERY_FULL_SYNC_OPERATION,
	INCREMENTAL_AVAILABILITY_OPERATION,
	INCREMENTAL_RATES_OPERATION,
	BOOKING_REVISION_FEED_OPERATION,
	"connection_test",
])

export function isRetryableProviderIntegrationRun(operation: unknown, status: unknown): boolean {
	return status === "failed" && RETRYABLE_OPERATIONS.has(String(operation))
}

export async function retryProviderIntegrationSyncRun(params: {
	providerId: string
	runId: string
	requestedBy: string
}) {
	const run = await db
		.select()
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.id, params.runId),
				eq(ProviderIntegrationSyncRun.providerId, params.providerId)
			)
		)
		.then((rows) => rows[0] ?? null)
	if (!run) throw new Error("INTEGRATION_SYNC_RUN_NOT_FOUND")
	if (!isRetryableProviderIntegrationRun(run.operation, run.status)) {
		throw new Error("INTEGRATION_SYNC_RUN_NOT_RETRYABLE")
	}
	const connection = await db
		.select({ id: ProviderIntegrationConnection.id, status: ProviderIntegrationConnection.status })
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, run.connectionId),
				eq(ProviderIntegrationConnection.providerId, params.providerId)
			)
		)
		.then((rows) => rows[0] ?? null)
	if (!connection || connection.status === "revoked") {
		throw new Error("INTEGRATION_CONNECTION_RECONNECT_REQUIRED")
	}

	const sourceJob = run.idempotencyKey
		? await db
				.select()
				.from(ProviderIntegrationSyncJob)
				.where(
					and(
						eq(ProviderIntegrationSyncJob.providerId, params.providerId),
						eq(ProviderIntegrationSyncJob.connectionId, run.connectionId),
						eq(ProviderIntegrationSyncJob.operation, run.operation),
						sql`${run.idempotencyKey} LIKE ${ProviderIntegrationSyncJob.idempotencyKey} || ':attempt:%'`
					)
				)
				.then((rows) => rows[0] ?? null)
		: null
	if (
		!sourceJob &&
		(run.operation === INCREMENTAL_AVAILABILITY_OPERATION ||
			run.operation === INCREMENTAL_RATES_OPERATION)
	) {
		throw new Error("INTEGRATION_SYNC_RETRY_CONTEXT_EXPIRED")
	}

	const now = new Date()
	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationSyncJob).values({
		id,
		providerId: params.providerId,
		connectionId: run.connectionId,
		targetType: "connection",
		targetId: run.connectionId,
		connectorKey: run.connectorKey,
		operation: run.operation,
		status: "queued",
		trigger: "retry",
		priority: 6,
		attempts: 0,
		maxAttempts: Math.max(3, Number(sourceJob?.maxAttempts ?? 5)),
		runAfter: now,
		idempotencyKey: `manual-retry:${params.runId}:${id}`,
		payloadJson: {
			...((sourceJob?.payloadJson && typeof sourceJob.payloadJson === "object"
				? sourceJob.payloadJson
				: {}) as Record<string, unknown>),
			requestedBy: params.requestedBy,
			retryOfRunId: params.runId,
		},
		createdAt: now,
		updatedAt: now,
	})
	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.requestedBy,
		action: "provider.integration.sync_run.retry_queued",
		entityType: "ProviderIntegrationSyncRun",
		entityId: params.runId,
		beforeJson: { status: run.status, operation: run.operation },
		afterJson: { jobId: id, status: "queued", operation: run.operation },
		riskLevel: "medium",
	})
	return { id, status: "queued", operation: run.operation, retryOfRunId: params.runId }
}

export { enqueueProviderRecoveryFullSync }
