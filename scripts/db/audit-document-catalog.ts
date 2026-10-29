import { config } from "dotenv"
import postgres from "postgres"
import { createHash } from "node:crypto"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"
import { databaseFingerprint } from "../../src/shared/infrastructure/db/data-environment"

config()
const url = getPostgresConnectionUrl("direct")
const client = postgres(url, { max: 1 })
try {
	const inventory = await client.begin("isolation level repeatable read read only", async (tx) => {
		const categories =
			await tx`SELECT type, status, "subjectType", count(*)::int AS count FROM "ProviderDocument" GROUP BY type, status, "subjectType" ORDER BY type, status, "subjectType"`
		const subjects = await tx`SELECT count(*)::int AS total,
			count(*) FILTER (WHERE d."subjectType" IN ('person','resource','third_party') AND r.id IS NULL)::int AS unresolved_resource_subjects,
			count(*) FILTER (WHERE d."subjectType" IN ('provider','legal_entity') AND d."subjectReference" IS NOT NULL)::int AS named_holder_subjects
			FROM "ProviderDocument" d LEFT JOIN "TourOperationalResource" r ON r.id = d."subjectReference" AND r."providerId" = d."providerId"`
		const policies = await tx`SELECT v.status, count(*)::int AS requirements,
			count(*) FILTER (WHERE jsonb_typeof(r."acceptedEvidenceJson") = 'array' AND jsonb_array_length(r."acceptedEvidenceJson") > 1)::int AS multiple_accepted_types
			FROM "ComplianceRequirementRule" r JOIN "CompliancePolicyVersion" v ON v.id = r."policyVersionId" GROUP BY v.status ORDER BY v.status`
		const history =
			await tx`SELECT count(*) FILTER (WHERE status = 'superseded')::int AS superseded FROM "ProviderDocument"`
		const protection: Record<string, { count: number; sha256: string }> = {}
		const legacyDocumentHash = createHash("sha256")
		for (const row of await tx`SELECT (to_jsonb(d) - 'definitionVersionId' - 'replacesDocumentId')::text AS payload FROM "ProviderDocument" d ORDER BY id`)
			legacyDocumentHash.update(row.payload).update("\n")
		for (const table of [
			"ProviderDocument",
			"ProviderDocumentScope",
			"ProviderDocumentInspection",
			"ProviderAuditLog",
			"CompliancePolicyVersion",
			"CommercialPolicyApproval",
			"ComplianceRequirementRule",
		]) {
			const rows = await tx`SELECT to_jsonb(t)::text AS payload FROM ${tx(table)} t ORDER BY id`
			const hash = createHash("sha256")
			for (const row of rows) hash.update(row.payload).update("\n")
			protection[table] = { count: rows.length, sha256: hash.digest("hex") }
		}
		return {
			categories,
			subjects,
			policies,
			history,
			protection,
			legacyDocumentSha256: legacyDocumentHash.digest("hex"),
		}
	})
	console.log(JSON.stringify({ fingerprint: databaseFingerprint(url), ...inventory }, null, 2))
} finally {
	await client.end()
}
