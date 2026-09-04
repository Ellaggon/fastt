import { cleanupExpiredCommandIdempotency } from "@/lib/commands/command-idempotency"

function readLimit(): number | undefined {
	const raw = process.argv.find((value) => value.startsWith("--limit="))?.slice("--limit=".length)
	if (!raw) return undefined
	const parsed = Number(raw)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000) {
		throw new Error("cleanup_limit_invalid")
	}
	return parsed
}

async function main() {
	const deleted = await cleanupExpiredCommandIdempotency({ limit: readLimit() })
	console.log(JSON.stringify({ ok: true, deleted }))
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
