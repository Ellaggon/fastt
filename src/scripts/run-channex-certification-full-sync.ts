import "dotenv/config"

import { and, db, desc, eq, ProviderIntegrationSyncRun } from "@/shared/infrastructure/db/compat"
import { enqueueProviderInitialAriSync } from "@/lib/channel-manager/channel-manager-initial-ari"
import { waitForProviderConfigurationRefreshes } from "@/lib/cache/invalidation"
import { runScheduledProviderIntegrationSync } from "@/lib/provider-integration-scheduler"
import { closePostgresClients } from "@/shared/infrastructure/db/client"

const PROVIDER_ID = "fastt-channex-certification-provider-v1"
const CONNECTION_ID = "e38ffcd8-5f1e-4567-b71c-241120938304"
const CERTIFICATION_ID = "fastt-channex-certification-session-v1"
const ACTOR_USER_ID = "fastt-channex-certification-operator-v1"

type RunSummary = {
	version?: number
	execution?: { context?: string; certificationId?: string | null; suiteVersion?: string | null }
	snapshot?: { hash?: string }
	requests?: {
		availability?: { requestIds?: string[]; taskIds?: string[] } | null
		ratesAndRestrictions?: { requestIds?: string[]; taskIds?: string[] } | null
	}
}

function assertExplicitConfirmation() {
	if (process.env.CHANNEX_CERTIFICATION_EXECUTE !== "true") {
		throw new Error("CHANNEX_CERTIFICATION_EXECUTE_TRUE_REQUIRED")
	}
}

function requestEvidence(summary: RunSummary | null) {
	const availability = summary?.requests?.availability
	const rates = summary?.requests?.ratesAndRestrictions
	if (!availability || !rates) throw new Error("CERTIFICATION_ARI_REQUEST_EVIDENCE_MISSING")
	if (availability.requestIds?.length !== 1 || rates.requestIds?.length !== 1) {
		throw new Error("CERTIFICATION_ARI_REQUEST_COUNT_INVALID")
	}
	return {
		availability: {
			requestId: availability.requestIds[0],
			taskIds: availability.taskIds ?? [],
		},
		ratesAndRestrictions: {
			requestId: rates.requestIds[0],
			taskIds: rates.taskIds ?? [],
		},
	}
}

async function main() {
	assertExplicitConfirmation()
	const job = await enqueueProviderInitialAriSync({
		providerId: PROVIDER_ID,
		connectionId: CONNECTION_ID,
		certificationId: CERTIFICATION_ID,
		requestedBy: ACTOR_USER_ID,
	})
	const worker = await runScheduledProviderIntegrationSync({
		providerId: PROVIDER_ID,
		batchSize: 1,
		concurrency: 1,
		providerLimit: 1,
	})
	if (worker.failed > 0) throw new Error("CERTIFICATION_ARI_WORKER_FAILED")

	const run = await db
		.select({
			id: ProviderIntegrationSyncRun.id,
			status: ProviderIntegrationSyncRun.status,
			certificationId: ProviderIntegrationSyncRun.certificationId,
			summaryJson: ProviderIntegrationSyncRun.summaryJson,
			startedAt: ProviderIntegrationSyncRun.startedAt,
			finishedAt: ProviderIntegrationSyncRun.finishedAt,
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
		.then((rows) => rows[0] ?? null)
	if (!run) throw new Error("CERTIFICATION_ARI_RUN_NOT_FOUND")
	if (run.status !== "succeeded") throw new Error(`CERTIFICATION_ARI_RUN_${run.status}`)
	const summary = (run.summaryJson ?? null) as RunSummary | null
	if (summary?.execution?.context !== "certification") {
		throw new Error("CERTIFICATION_ARI_RUN_CONTEXT_INVALID")
	}
	if (summary.execution.certificationId !== CERTIFICATION_ID || !summary.snapshot?.hash) {
		throw new Error("CERTIFICATION_ARI_RUN_EVIDENCE_INVALID")
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				job: { id: job.id, status: job.status, created: job.created },
				worker,
				run: {
					id: run.id,
					status: run.status,
					certificationId: run.certificationId,
					startedAt: run.startedAt,
					finishedAt: run.finishedAt,
					version: summary.version,
					execution: summary.execution,
					snapshotHash: summary.snapshot.hash,
					requests: requestEvidence(summary),
				},
			},
			null,
			2
		)
	)
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "CHANNEX_CERTIFICATION_FULL_SYNC_FAILED")
		process.exitCode = 1
	})
	.finally(async () => {
		await waitForProviderConfigurationRefreshes()
		await closePostgresClients()
	})
