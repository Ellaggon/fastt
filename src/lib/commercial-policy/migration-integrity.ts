import { createHash } from "node:crypto"
import type postgres from "postgres"

// Explicit allowlist: identifiers must never come from CLI or provider input.
export const preservedComplianceTables = [
	"CompliancePolicySet",
	"CompliancePolicyVersion",
	"ComplianceRequirementRule",
	"CommercialPolicyApproval",
	"DocumentDefinition",
	"DocumentDefinitionVersion",
	"ProviderDocument",
	"ProviderDocumentScope",
	"ProviderDocumentInspection",
	"ProviderAuditLog",
	"BookingPolicySnapshot",
] as const

export type ComplianceSnapshot = Record<string, { count: number; sha256: string }>

/** Call inside a repeatable-read, read-only transaction for a coherent inventory. */
export async function readComplianceSnapshot(
	tx: postgres.TransactionSql
): Promise<ComplianceSnapshot> {
	const result: ComplianceSnapshot = {}
	for (const table of preservedComplianceTables) {
		const hash = createHash("sha256")
		let count = 0
		for await (const rows of tx
			.unsafe(`SELECT to_jsonb(t)::text AS payload FROM "${table}" t ORDER BY t.id`)
			.cursor(250)) {
			for (const row of rows) {
				const payload = String(row.payload)
				hash.update(`${Buffer.byteLength(payload)}:`).update(payload)
				count++
			}
		}
		result[table] = { count, sha256: hash.digest("hex") }
	}
	return result
}

/** A mismatch blocks certification; it is not permission to repair or overwrite data. */
export function compareComplianceSnapshots(before: ComplianceSnapshot, after: ComplianceSnapshot) {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])]
		.sort()
		.filter(
			(table) =>
				!before[table] ||
				!after[table] ||
				before[table].count !== after[table].count ||
				before[table].sha256 !== after[table].sha256
		)
}
