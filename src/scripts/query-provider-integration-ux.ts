import "dotenv/config"

import { summarizeProviderIntegrationUx } from "@/lib/provider-integration-ux"

function argument(name: string): string | null {
	const prefix = `${name}=`
	return (
		process.argv
			.find((value) => value.startsWith(prefix))
			?.slice(prefix.length)
			.trim() || null
	)
}

async function main() {
	const summary = await summarizeProviderIntegrationUx({
		providerId: argument("--provider"),
		limit: Number(argument("--limit") ?? 5_000),
		maturityMinutes: Number(argument("--maturity-minutes") ?? 30),
	})
	console.log(JSON.stringify(summary, null, 2))
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	})
