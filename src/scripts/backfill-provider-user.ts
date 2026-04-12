/**
 * @deprecated
 * Legacy backfill relied on Provider.userEmail. Provider resolution is now strict via ProviderUser.
 * This script is intentionally disabled to avoid reintroducing email-based linkage.
 */
async function main() {
	console.warn(
		JSON.stringify({
			action: "provider_user_backfill",
			status: "disabled",
			reason: "legacy_email_based_backfill_removed",
		})
	)
}

main().catch((error) => {
	console.error(
		JSON.stringify({
			action: "provider_user_backfill",
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
		})
	)
	process.exitCode = 1
})
