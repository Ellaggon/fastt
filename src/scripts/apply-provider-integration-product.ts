/**
 * Legacy Turso apply helper for the early integrations product surface.
 * ProviderIntegrationSyncLog was removed in Phase 2
 * (`db/migrations/2026-08-05_provider_integration_drop_synclog.sql`).
 * Canonical history: ProviderIntegrationSyncRun + ProviderAuditLog.
 */
export default async function applyProviderIntegrationProduct() {
	console.log(
		JSON.stringify({
			migration: "provider_integration_product",
			applied: 0,
			note: "ProviderIntegrationSyncLog dropped; no-op apply script.",
		})
	)
}
