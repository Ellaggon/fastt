import { describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	Provider,
	ProviderAuditLog,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncRun,
	ProviderUser,
	User,
} from "@/shared/infrastructure/db/compat"
import {
	connectProviderIntegration,
	revokeProviderIntegration,
	syncProviderIntegration,
	listProviderIntegrations,
} from "@/lib/provider-integrations"

async function upsertPostgresProvider(row: {
	id: string
	legalName?: string | null
	displayName?: string | null
	ownerEmail: string
}) {
	const legalName = String(row.legalName ?? row.displayName ?? `Provider ${row.id}`).trim()
	const displayName = String(row.displayName ?? row.legalName ?? `Provider ${row.id}`).trim()
	const email = row.ownerEmail.trim().toLowerCase()
	const existingUsers = await db.select({ id: User.id }).from(User).where(eq(User.email, email))
	const existingUser = existingUsers[0]
	const userId = existingUser?.id ?? `user_${email}`

	await db
		.insert(Provider)
		.values({
			id: row.id,
			legalName,
			displayName,
			status: "draft",
			createdAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [Provider.id],
			set: {
				legalName,
				displayName,
				status: "draft",
			},
		})

	if (!existingUser?.id) {
		await db.insert(User).values({ id: userId, email }).onConflictDoNothing()
	}

	await db
		.insert(ProviderUser)
		.values({
			id: `provider_user_${row.id}`,
			providerId: row.id,
			userId,
			role: "owner",
		})
		.onConflictDoUpdate({
			target: [ProviderUser.providerId, ProviderUser.userId],
			set: { role: "owner" },
		})

	return { userId }
}

describe("integration/provider integrations product", () => {
	it("persists connector configuration, sync runs, scopes, mode and revocation", async () => {
		const providerId = "provider_integrations_product"
		const ownerEmail = "integrations.product@example.com"

		const { userId: ownerId } = await upsertPostgresProvider({
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
			credentialSecret: "test://cloudbeds-ok",
			vendorKey: "cloudbeds",
			authType: "api_key",
			externalPropertyId: "cloudbeds_property_1",
		})

		const connections = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		const connection = connections[0]

		expect(connection?.connectorKey).toBe("channel_manager")
		expect(connection?.status).toBe("pending")
		expect(connection?.mode).toBe("sandbox")
		expect(connection?.scopesJson).toEqual(["availability:sync", "rates:sync"])
		expect(connection?.vendorKey).toBe("cloudbeds")
		expect(connection?.authType).toBe("api_key")
		expect(connection?.externalPropertyId).toBe("cloudbeds_property_1")

		await syncProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
		})

		const cards = await listProviderIntegrations({
			providerId,
			currentUserId: ownerId,
			includeRecentActivity: true,
		})
		const card = cards.find((connector) => connector.key === "channel_manager")
		expect(card?.status).toBe("connected")
		expect(card?.vendorKey).toBe("cloudbeds")
		expect(card?.lastSyncStatus).toBe("success")
		expect(card?.recentActivity.some((item) => item.eventType === "sync.test")).toBe(true)
		expect(card?.recentActivity.some((item) => item.eventType === "configuration.saved")).toBe(true)

		await connectProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "external_calendars",
			mode: "sandbox",
			scopes: ["calendar:import"],
		})
		const failed = await syncProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "external_calendars",
		})
		expect(failed.status).toBe("error")

		await revokeProviderIntegration({
			providerId,
			currentUserId: ownerId,
			connectorKey: "channel_manager",
		})

		const revokedRows = await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.providerId, providerId),
					eq(ProviderIntegrationConnection.connectorKey, "channel_manager")
				)
			)
		const revoked = revokedRows[0]
		expect(revoked?.status).toBe("revoked")
		expect(revoked?.endpointUrl).toBeNull()

		const runs = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
		expect(runs.some((run) => run.operation === "connection_test")).toBe(true)

		const audits = await db
			.select()
			.from(ProviderAuditLog)
			.where(eq(ProviderAuditLog.providerId, providerId))
		expect(audits.map((row) => row.action)).toEqual(
			expect.arrayContaining([
				"provider.integration.connect",
				"provider.integration.sync_test",
				"provider.integration.revoke",
			])
		)
	}, 20_000)
})
