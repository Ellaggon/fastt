import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	Provider,
	ProviderAuditLog,
	ProviderConfigurationState,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderIntegrationIncident,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	ProviderUser,
	User,
} from "@/shared/infrastructure/db/compat"

import {
	connectProviderIntegration,
	listProviderIntegrations,
	revokeProviderIntegration,
} from "@/lib/provider-integrations"
import {
	finishProviderIntegrationSyncRun,
	recordProviderIntegrationIncident,
	resolveProviderIntegrationIncident,
	setPrimaryProviderIntegrationConnection,
	startProviderIntegrationSyncRun,
	upsertProviderIntegrationMapping,
} from "@/lib/provider-integration-operations"
import { runScheduledProviderIntegrationSync } from "@/lib/provider-integration-scheduler"

describe("provider integration operations", () => {
	const providerId = "provider_integration_operations"
	const ownerEmail = "integration.operations@example.com"
	const ownerId = `user_${ownerEmail}`

	async function cleanup() {
		await db
			.delete(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.providerId, providerId))
		await db
			.delete(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		await db
			.delete(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
		await db
			.delete(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.providerId, providerId))
		await db
			.delete(ProviderIntegrationCredential)
			.where(eq(ProviderIntegrationCredential.providerId, providerId))
		await db
			.delete(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
		await db
			.delete(ProviderConfigurationState)
			.where(eq(ProviderConfigurationState.providerId, providerId))
	}

	beforeAll(cleanup)
	afterAll(cleanup)

	it("supports multiple connections, canonical mappings, idempotent runs and actionable incidents", async () => {
		await db
			.insert(Provider)
			.values({
				id: providerId,
				legalName: "Integration Operations S.R.L.",
				displayName: "Integration Operations",
				status: "draft",
			})
			.onConflictDoUpdate({
				target: [Provider.id],
				set: { displayName: "Integration Operations" },
			})
		await db.insert(User).values({ id: ownerId, email: ownerEmail }).onConflictDoNothing()
		await db
			.insert(ProviderUser)
			.values({
				id: crypto.randomUUID(),
				providerId,
				userId: ownerId,
				role: "owner",
			})
			.onConflictDoNothing()

		const primaryId = await connectProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
			mode: "sandbox",
			scopes: ["availability:sync"],
			credentialSecret: "test://smoke-ok",
			displayName: "Hotel principal",
		})
		const secondaryId = await connectProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
			mode: "sandbox",
			scopes: ["availability:sync", "rates:sync"],
			credentialSecret: "test://smoke-ok",
			displayName: "Segunda propiedad",
			createNew: true,
		})

		const cards = await listProviderIntegrations({ providerId, currentUserId: ownerId })
		const channelManager = cards.find((card) => card.key === "channel_manager")
		expect(channelManager?.connectionCount).toBe(2)
		expect(channelManager?.instances.map((row) => row.displayName)).toEqual(
			expect.arrayContaining(["Hotel principal", "Segunda propiedad"])
		)
		expect(channelManager?.instances.filter((row) => row.isPrimary)).toHaveLength(1)

		await setPrimaryProviderIntegrationConnection({
			providerId,
			connectionId: secondaryId,
		})
		const promoted = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		expect(promoted.find((row) => row.id === secondaryId)?.isPrimary).toBe(true)
		expect(promoted.find((row) => row.id === primaryId)?.isPrimary).toBe(false)

		const mappingId = await upsertProviderIntegrationMapping({
			providerId,
			connectionId: secondaryId,
			input: {
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: "variant_local_1",
				externalEntityType: "room_type",
				externalEntityId: "remote_room_1",
				externalEntityName: "Deluxe King",
				direction: "bidirectional",
			},
		})
		await upsertProviderIntegrationMapping({
			providerId,
			connectionId: secondaryId,
			input: {
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: "variant_local_1",
				externalEntityType: "room_type",
				externalEntityId: "remote_room_1",
				externalEntityName: "Deluxe King actualizada",
			},
		})
		const mappings = await db
			.select()
			.from(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.connectionId, secondaryId))
		expect(mappings).toHaveLength(1)
		expect(mappings[0]?.id).toBe(mappingId)
		expect(mappings[0]?.externalEntityName).toBe("Deluxe King actualizada")

		await db
			.update(ProviderIntegrationConnection)
			.set({ syncEnabled: false, nextSyncAt: null })
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		await db
			.update(ProviderIntegrationConnection)
			.set({
				syncEnabled: true,
				nextSyncAt: new Date("2026-08-01T00:00:00.000Z"),
				syncIntervalMinutes: 1440,
			})
			.where(eq(ProviderIntegrationConnection.id, secondaryId))
		const workerResult = await runScheduledProviderIntegrationSync({
			now: new Date("2026-08-01T00:05:00.000Z"),
			providerId,
			batchSize: 5,
			concurrency: 2,
			providerLimit: 2,
		})
		expect(workerResult).toMatchObject({ enqueued: 1, claimed: 1, succeeded: 1, failed: 0 })
		const jobs = await db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		expect(jobs.some((job) => job.connectionId === secondaryId && job.status === "succeeded")).toBe(
			true
		)
		const scheduledRuns = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
		expect(
			scheduledRuns.some(
				(run) =>
					run.connectionId === secondaryId &&
					run.trigger === "scheduled" &&
					run.status === "succeeded"
			)
		).toBe(true)

		const run = await startProviderIntegrationSyncRun({
			providerId,
			connectionId: secondaryId,
			operation: "catalog_pull",
			requestedBy: ownerId,
			idempotencyKey: "catalog:2026-07-27T00",
		})
		const duplicateRun = await startProviderIntegrationSyncRun({
			providerId,
			connectionId: secondaryId,
			operation: "catalog_pull",
			requestedBy: ownerId,
			idempotencyKey: "catalog:2026-07-27T00",
		})
		expect(duplicateRun.id).toBe(run.id)
		await finishProviderIntegrationSyncRun({
			providerId,
			runId: run.id,
			status: "partial",
			readCount: 12,
			changedCount: 4,
			failedCount: 1,
			errorCode: "REMOTE_RATE_INVALID",
		})
		const storedRun = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.id, run.id))
			.then((rows) => rows[0])
		expect(storedRun?.status).toBe("partial")
		expect(storedRun?.readCount).toBe(12)

		const incidentInput = {
			dedupeKey: "remote_rate_invalid:remote_room_1",
			code: "REMOTE_RATE_INVALID",
			category: "data_quality" as const,
			severity: "error" as const,
			title: "Una tarifa externa no es válida",
			description: "Corrige la tarifa en el proveedor y vuelve a sincronizar.",
			actionLabel: "Revisar integración",
			actionHref: "/provider/settings/integrations?mode=pro",
			mappingId,
		}
		const incidentId = await recordProviderIntegrationIncident({
			providerId,
			connectionId: secondaryId,
			syncRunId: run.id,
			input: incidentInput,
		})
		await recordProviderIntegrationIncident({
			providerId,
			connectionId: secondaryId,
			syncRunId: run.id,
			input: incidentInput,
		})
		let incident = await db
			.select()
			.from(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.id, incidentId))
			.then((rows) => rows[0])
		expect(incident?.occurrenceCount).toBe(2)
		expect(incident?.status).toBe("open")

		await resolveProviderIntegrationIncident({
			providerId,
			incidentId,
			resolvedBy: ownerId,
			resolutionNote: "Corregida en el sistema externo.",
		})
		await recordProviderIntegrationIncident({
			providerId,
			connectionId: secondaryId,
			syncRunId: run.id,
			input: incidentInput,
		})
		incident = await db
			.select()
			.from(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.id, incidentId))
			.then((rows) => rows[0])
		expect(incident?.status).toBe("open")
		expect(incident?.occurrenceCount).toBe(3)

		await revokeProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
			connectionId: secondaryId,
		})
		const afterRevoke = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		expect(afterRevoke.find((row) => row.id === primaryId)?.isPrimary).toBe(true)
		expect(afterRevoke.find((row) => row.id === secondaryId)?.status).toBe("revoked")
		const inactiveMapping = await db
			.select()
			.from(ProviderIntegrationMapping)
			.where(
				and(
					eq(ProviderIntegrationMapping.connectionId, secondaryId),
					eq(ProviderIntegrationMapping.id, mappingId)
				)
			)
			.then((rows) => rows[0])
		expect(inactiveMapping?.status).toBe("inactive")
	}, 30_000)
})
