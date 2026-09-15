/** Aggregate-only audit. No session/auth healing, writes or raw audit payloads. */
import { writeFile } from "node:fs/promises"
import {
	createPostgresSqlClient,
	closePostgresClients,
} from "../../src/shared/infrastructure/db/client"
import { getFasttDataEnvironment } from "../../src/shared/infrastructure/db/runtime-environment"

async function main() {
	const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9)
	const sql = createPostgresSqlClient({ max: 1 })
	try {
		const snapshot = await sql.begin("read only", async (tx) => {
			await tx`SET LOCAL statement_timeout = '15000ms'`
			const [window] = await tx`SELECT now() AS "to", now() - interval '30 days' AS "from"`
			const events = await tx`
        SELECT p."dataClassification" AS "dataClassification", p."accountPurpose" AS "accountPurpose",
          a.action, count(*)::int AS "events", count(distinct a."providerId")::int AS "providers"
        FROM "ProviderAuditLog" a JOIN "Provider" p ON p.id = a."providerId"
        WHERE a."createdAt" >= ${window.from} AND a."createdAt" < ${window.to}
          AND a."entityType" = 'SettingsFunnel'
        GROUP BY p."dataClassification", p."accountPurpose", a.action
        ORDER BY 1, 2, 3`
			const [population] = await tx`
        SELECT count(*)::int AS "allProviders",
          count(*) FILTER (WHERE "dataClassification" = 'production' AND "accountPurpose" = 'commercial')::int AS "commercialProductionProviders"
        FROM "Provider"`
			return { window, events, population }
		})
		const result = {
			capturedAt: new Date().toISOString(),
			dataEnvironment: getFasttDataEnvironment(),
			configuredSink: process.env.SETTINGS_FUNNEL_SINK ?? "log (default)",
			scope: "Configured local connection; not a certification of deployed production traffic",
			...snapshot,
			activationConversion: null,
			reason:
				"SettingsFunnel does not establish signup cohort, selected intent or first bookable offer; counts are not conversion rates.",
		}
		const json = JSON.stringify(result, null, 2) + "\n"
		if (output) await writeFile(output, json)
		console.log(json)
	} finally {
		await closePostgresClients()
	}
}
main().catch(() => {
	// Do not print connection errors that may contain endpoints or credentials.
	console.error(
		"Baseline query failed; no measurement certified. Check database access and schema."
	)
	process.exitCode = 1
})
