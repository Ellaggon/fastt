import { db, sql } from "astro:db"

let ownerProviderIdColumnEnsured = false
let policyProfessionalColumnsEnsured = false
let policyAssignmentCategoryColumnEnsured = false

async function ensureColumn(params: { table: string; column: string; definition: string }) {
	try {
		await db.run(
			sql.raw(`ALTER TABLE ${params.table} ADD COLUMN ${params.column} ${params.definition}`)
		)
	} catch (error: any) {
		const message = String(error?.message ?? error)
		if (
			!message.includes("duplicate column name") &&
			!message.includes("already exists") &&
			!message.includes("no such table")
		) {
			throw error
		}
	}
}

export async function ensurePolicyGroupOwnerProviderIdColumn(): Promise<void> {
	if (ownerProviderIdColumnEnsured) return
	await ensureColumn({ table: "PolicyGroup", column: "ownerProviderId", definition: "TEXT" })
	ownerProviderIdColumnEnsured = true
}

export async function ensurePolicyProfessionalColumns(): Promise<void> {
	if (policyProfessionalColumnsEnsured) return
	for (const column of [
		{ column: "status", definition: "TEXT DEFAULT 'active'" },
		{ column: "policyPresetKey", definition: "TEXT" },
		{ column: "stayLengthType", definition: "TEXT" },
		{ column: "gracePeriod", definition: "INTEGER" },
		{ column: "refundBasis", definition: "TEXT" },
		{ column: "payoutBasis", definition: "TEXT" },
		{ column: "localTimezone", definition: "TEXT" },
		{ column: "legalOverrideFlags", definition: "JSON" },
		{ column: "effectiveFrom", definition: "TEXT" },
		{ column: "effectiveTo", definition: "TEXT" },
	]) {
		await ensureColumn({ table: "Policy", ...column })
	}
	policyProfessionalColumnsEnsured = true
}

export async function ensurePolicyAssignmentCategoryColumn(): Promise<void> {
	if (policyAssignmentCategoryColumnEnsured) return
	await ensureColumn({ table: "PolicyAssignment", column: "category", definition: "TEXT" })
	policyAssignmentCategoryColumnEnsured = true
}

export async function ensurePolicySchemaCompatibility(): Promise<void> {
	await ensurePolicyGroupOwnerProviderIdColumn()
	await ensurePolicyProfessionalColumns()
	await ensurePolicyAssignmentCategoryColumn()
}
