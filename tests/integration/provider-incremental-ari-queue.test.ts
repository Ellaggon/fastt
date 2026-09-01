import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
	enqueueProviderIncrementalAriChange,
	parseIncrementalAriJobPayload,
} from "@/lib/channel-manager/channel-manager-incremental-queue"
import {
	flushProviderChannelManagerIncrementalJobs,
	setProviderChannelManagerSyncEnabled,
} from "@/lib/provider-integrations"
import {
	db,
	eq,
	Provider,
	ProviderAuditLog,
	ProviderConfigurationState,
	ProviderIntegrationConnection,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	Product,
	Variant,
} from "@/shared/infrastructure/db/compat"

describe("provider incremental ARI queue", () => {
	const providerId = "provider_incremental_ari_queue"
	const connectionId = "connection_incremental_ari_queue"
	const productId = "product_incremental_ari_queue"
	const variantIds = ["room-1", "room-2"] as const

	async function cleanup() {
		await db
			.delete(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		await db
			.delete(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
		await db
			.delete(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.providerId, providerId))
		await db.delete(Variant).where(eq(Variant.productId, productId))
		await db.delete(Product).where(eq(Product.id, productId))
		await db
			.delete(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
		await db
			.delete(ProviderConfigurationState)
			.where(eq(ProviderConfigurationState.providerId, providerId))
		await db.delete(Provider).where(eq(Provider.id, providerId))
	}

	beforeAll(async () => {
		await cleanup()
		await db.insert(Provider).values({
			id: providerId,
			legalName: "Incremental ARI QA",
			displayName: "Incremental ARI QA",
			status: "draft",
		})
		await db.insert(ProviderIntegrationConnection).values({
			id: connectionId,
			providerId,
			connectorKey: "channel_manager",
			status: "connected",
			mode: "sandbox",
			vendorKey: "channex",
			externalPropertyId: "remote-property",
			lastSyncStatus: "initial_ari_succeeded",
			syncEnabled: true,
		})
		await db.insert(Product).values({
			id: productId,
			name: "Incremental ARI QA Hotel",
			productType: "hotel",
			providerId,
			dataClass: "fixture",
		})
		await db.insert(Variant).values(
			variantIds.map((id) => ({
				id,
				productId,
				name: id,
				kind: "hotel_room",
				lifecycleState: "ready" as const,
				salesEnabled: true,
			}))
		)
		await db.insert(ProviderIntegrationMapping).values([
			{
				id: "mapping-incremental-room-1",
				providerId,
				connectionId,
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: "room-1",
				externalEntityType: "room_type",
				externalEntityId: "remote-room-1",
			},
			{
				id: "mapping-incremental-room-2",
				providerId,
				connectionId,
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: "room-2",
				externalEntityType: "room_type",
				externalEntityId: "remote-room-2",
			},
		])
	})

	afterAll(cleanup)

	it("coalesces durable bulk effects into one connection operation", async () => {
		const now = new Date("2026-08-03T12:34:15.000Z")
		await enqueueProviderIncrementalAriChange({
			domain: "availability",
			variantIds: ["room-1"],
			from: "2026-08-10",
			toExclusive: "2026-08-12",
			now,
			idempotencyScope: "pricing-bulk:job-1:effects",
		})
		await enqueueProviderIncrementalAriChange({
			domain: "availability",
			variantIds: ["room-2", "room-1"],
			from: "2026-08-09",
			toExclusive: "2026-08-14",
			now: new Date("2026-08-03T12:34:42.000Z"),
			idempotencyScope: "pricing-bulk:job-1:effects",
		})
		const jobs = await db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		expect(jobs).toHaveLength(1)
		expect(jobs[0]?.runAfter.toISOString()).toBe("2026-08-03T12:35:00.000Z")
		expect(jobs[0]?.idempotencyKey).toContain("pricing-bulk:job-1:effects")
		expect(parseIncrementalAriJobPayload(jobs[0]?.payloadJson)).toMatchObject({
			domain: "availability",
			from: "2026-08-09",
			toExclusive: "2026-08-14",
			variantIds: ["room-1", "room-2"],
		})
	})

	it("flushes pending changes and enforces pause/resume at the connection boundary", async () => {
		await db.insert(ProviderIntegrationSyncRun).values({
			id: "run_incremental_ari_initial",
			providerId,
			connectionId,
			connectorKey: "channel_manager",
			operation: "initial_ari_sync",
			status: "succeeded",
			finishedAt: new Date(),
		})

		const flushed = await flushProviderChannelManagerIncrementalJobs({
			providerId,
			connectionId,
		})
		expect(flushed.queuedChanges).toBe(1)
		const [manualJob] = await db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		expect(manualJob?.trigger).toBe("manual")

		await setProviderChannelManagerSyncEnabled({ providerId, connectionId, enabled: false })
		const [pausedConnection] = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.id, connectionId))
		expect(pausedConnection?.syncEnabled).toBe(false)
		expect(
			await db
				.select()
				.from(ProviderIntegrationSyncJob)
				.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		).toHaveLength(0)
		await expect(
			flushProviderChannelManagerIncrementalJobs({ providerId, connectionId })
		).rejects.toThrow("INTEGRATION_SYNC_PAUSED_OR_UNHEALTHY")

		await setProviderChannelManagerSyncEnabled({ providerId, connectionId, enabled: true })
		const [resumedConnection] = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.id, connectionId))
		expect(resumedConnection?.syncEnabled).toBe(true)
		expect(resumedConnection?.nextSyncAt).toBeInstanceOf(Date)
	})
})
