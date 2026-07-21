import { describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncLog,
} from "astro:db"
import {
	connectProviderIntegration,
	revokeProviderIntegration,
	syncProviderIntegration,
	listProviderIntegrations,
} from "@/lib/provider-integrations"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("integration/provider integrations product", () => {
	it("persists connector configuration, sync logs, scopes, mode and revocation", async () => {
		const providerId = "provider_integrations_product"
		const ownerEmail = "integrations.product@example.com"
		const ownerId = `user_${ownerEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Integraciones Producto S.R.L.",
			displayName: "Integraciones Producto",
			ownerEmail,
		})

		await connectProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
			mode: "sandbox",
			scopes: ["availability:sync", "rates:sync"],
			credentialsRef: "vault://provider/channel-manager",
		})

		const connection = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
			.get()

		expect(connection?.connectorKey).toBe("channel_manager")
		expect(connection?.status).toBe("pending")
		expect(connection?.mode).toBe("sandbox")
		expect(connection?.scopesJson).toEqual(["availability:sync", "rates:sync"])

		await syncProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
		})

		const cards = await listProviderIntegrations({ providerId, currentUserId: ownerId })
		const card = cards.find((connector) => connector.key === "channel_manager")
		expect(card?.status).toBe("connected")
		expect(card?.lastSyncStatus).toBe("success")
		expect(card?.logs.some((log) => log.eventType === "sync.test")).toBe(true)

		await connectProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "payment_gateway",
			mode: "sandbox",
			scopes: ["payments:authorize"],
			credentialsRef: "not-a-real-probe",
		})
		const failed = await syncProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "payment_gateway",
		})
		expect(failed.status).toBe("error")

		await revokeProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
		})

		const revoked = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.providerId, providerId),
					eq(ProviderIntegrationConnection.connectorKey, "channel_manager")
				)
			)
			.get()
		expect(revoked?.status).toBe("revoked")
		expect(revoked?.credentialsRef).toBeNull()

		const logs = await db
			.select()
			.from(ProviderIntegrationSyncLog)
			.where(eq(ProviderIntegrationSyncLog.providerId, providerId))
			.all()
		expect(logs.map((log) => log.eventType)).toEqual(
			expect.arrayContaining(["configuration.saved", "sync.test", "credentials.revoked"])
		)
	})
})
