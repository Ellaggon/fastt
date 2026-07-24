/**
 * Ops: query settings funnel summary from ProviderAuditLog.
 *
 * Usage:
 *   SETTINGS_FUNNEL_SINK=db pnpm exec tsx src/scripts/query-settings-funnel.ts
 *   pnpm exec tsx src/scripts/query-settings-funnel.ts --provider=prov_id
 */
import {
	getSettingsFunnelQueryStatus,
	listProviderSettingsFunnelEvents,
	summarizeProviderSettingsFunnel,
	summarizeProviderSettingsFunnelByDomain,
} from "../lib/provider-settings-funnel"

function argValue(flag: string): string | null {
	const prefix = `${flag}=`
	const hit = process.argv.find((arg) => arg.startsWith(prefix))
	return hit ? hit.slice(prefix.length).trim() || null : null
}

async function main() {
	const providerId = argValue("--provider")
	const status = getSettingsFunnelQueryStatus()
	const summary = await summarizeProviderSettingsFunnel({ providerId })
	const byDomain = await summarizeProviderSettingsFunnelByDomain({ providerId })
	const events = await listProviderSettingsFunnelEvents({
		providerId,
		limit: Number(argValue("--limit") ?? 20) || 20,
	})

	console.log(
		JSON.stringify(
			{
				status,
				summary,
				byDomain,
				events,
			},
			null,
			2
		)
	)

	if (!status.queryable) {
		console.error(
			`\n[warn] sink=${status.sink} — set SETTINGS_FUNNEL_SINK=db|both to persist queryable events.`
		)
		process.exitCode = 0
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
