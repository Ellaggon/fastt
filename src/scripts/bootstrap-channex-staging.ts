import "dotenv/config"

import {
	and,
	db,
	eq,
	Provider,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"
import { closePostgresClients } from "@/shared/infrastructure/db/client"
import { waitForProviderConfigurationRefreshes } from "@/lib/cache/invalidation"
import { connectProviderIntegration } from "@/lib/provider-integrations"
import { decryptProviderIntegrationSecret } from "@/lib/provider-integration-vault"

function requiredEnv(name: string): string {
	const value = String(process.env[name] ?? "").trim()
	if (!value) throw new Error(`${name}_REQUIRED`)
	return value
}

async function main() {
	const apiKey = requiredEnv("CHANNEX_STAGING_API_KEY")
	const providerId = String(
		process.env.CHANNEX_STAGING_PROVIDER_ID ?? process.env.LOCAL_QA_PROVIDER_ID ?? ""
	).trim()
	if (!providerId) throw new Error("CHANNEX_STAGING_PROVIDER_ID_OR_LOCAL_QA_PROVIDER_ID_REQUIRED")
	const externalPropertyId = String(process.env.CHANNEX_STAGING_PROPERTY_ID ?? "").trim() || null

	const provider = await db
		.select({ id: Provider.id })
		.from(Provider)
		.where(eq(Provider.id, providerId))
		.limit(1)
		.then((rows) => rows[0])
	if (!provider) throw new Error("CHANNEX_STAGING_PROVIDER_NOT_FOUND")

	const owner = await db
		.select({ userId: ProviderUser.userId })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.role, "owner")))
		.limit(1)
		.then((rows) => rows[0])
	if (!owner) throw new Error("CHANNEX_STAGING_PROVIDER_OWNER_NOT_FOUND")

	const existing = await db
		.select({ id: ProviderIntegrationConnection.id })
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, providerId),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager"),
				eq(ProviderIntegrationConnection.vendorKey, "channex"),
				eq(ProviderIntegrationConnection.mode, "sandbox")
			)
		)
		.limit(1)
		.then((rows) => rows[0] ?? null)

	const connectionId = await connectProviderIntegration({
		providerId,
		currentUserId: owner.userId,
		connectorKey: "channel_manager",
		mode: "sandbox",
		scopes: ["availability:sync", "rates:sync", "restrictions:sync"],
		credentialSecret: apiKey,
		connectionId: existing?.id ?? null,
		createNew: !existing,
		displayName: "Channex staging QA",
		vendorKey: "channex",
		authType: "api_key",
		externalPropertyId,
	})

	const credential = await db
		.select({
			authType: ProviderIntegrationCredential.authType,
			encryptedJson: ProviderIntegrationCredential.encryptedJson,
		})
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.connectionId, connectionId))
		.limit(1)
		.then((rows) => rows[0])
	if (!credential) throw new Error("CHANNEX_STAGING_VAULT_WRITE_FAILED")
	const decrypted = decryptProviderIntegrationSecret({
		providerId,
		connectionId,
		authType: credential.authType,
		encrypted: credential.encryptedJson,
	})
	if (decrypted.authType === "oauth2" || decrypted.secret !== apiKey) {
		throw new Error("CHANNEX_STAGING_VAULT_VERIFICATION_FAILED")
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				providerId,
				connectionId,
				mode: "sandbox",
				vendor: "channex",
				externalPropertyConfigured: Boolean(externalPropertyId),
				vaultVerified: true,
				nextStep: externalPropertyId
					? "Ejecuta Probar acceso desde el detalle de la conexión."
					: "Selecciona la propiedad remota desde el asistente antes de probar el acceso.",
			},
			null,
			2
		)
	)
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "CHANNEX_STAGING_BOOTSTRAP_FAILED")
		process.exitCode = 1
	})
	.finally(async () => {
		await waitForProviderConfigurationRefreshes()
		await closePostgresClients()
	})
