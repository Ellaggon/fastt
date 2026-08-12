/**
 * Read-only Phase 0 audit for a provider's commercial tax configuration.
 * Usage:
 *   pnpm exec tsx src/scripts/audit-fiscality-configuration.ts --provider=provider_id
 *   pnpm exec tsx src/scripts/audit-fiscality-configuration.ts --all
 */
import { getProviderFiscalityAudit } from "@/lib/taxes-fees/fiscality-audit"
import { db, TaxFeeDefinition } from "@/shared/infrastructure/db/compat"

function providerIdFromArgs() {
	const arg = process.argv.find((value) => value.startsWith("--provider="))
	return arg?.slice("--provider=".length).trim() || null
}

async function main() {
	const providerId = providerIdFromArgs()
	if (providerId) {
		console.log(JSON.stringify(await getProviderFiscalityAudit(providerId), null, 2))
		return
	}
	if (!process.argv.includes("--all")) {
		throw new Error("Use --provider=provider_id or --all")
	}
	const providers = await db
		.select({ providerId: TaxFeeDefinition.providerId })
		.from(TaxFeeDefinition)
	const providerIds = [
		...new Set(providers.map((row) => row.providerId).filter((id): id is string => Boolean(id))),
	]
	const audits = await Promise.all(
		providerIds.map(async (id) => ({ providerId: id, audit: await getProviderFiscalityAudit(id) }))
	)
	console.log(JSON.stringify({ providers: audits }, null, 2))
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
