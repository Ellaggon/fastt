import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { loadLaPazPolicyDrafts } from "@/lib/commercial-policy/la-paz-policy-load"
import { ratifyCommercialTourPolicy } from "@/lib/commercial-policy/ratification"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import {
	db,
	sql,
	eq,
	CompliancePolicyVersion,
	CommercialPolicyApproval,
} from "@/shared/infrastructure/db/compat"
import { upsertTestUser } from "@/shared/infrastructure/test-support/db-test-data"
import { ensureOperatingGeographyFixtures } from "../test-support/operating-geography"

it("publishes all La Paz pieces with the real database publication guard and one responsible reviewer", async () => {
	await ensureOperatingGeographyFixtures()
	const rollback = new Error("rollback_ratification_certification")
	await expect(
		withPostgresTransaction(async () => {
			await db.execute(
				sql.raw(
					readFileSync("db/migrations/2026-11-10_versioned_policy_publication_guard.sql", "utf8")
				)
			)
			const reviewer = "la-paz-ratification-certifier"
			await upsertTestUser({ id: reviewer, email: "ratification-certifier@example.invalid" })
			const result = await loadLaPazPolicyDrafts("2026-11-10")
			const recoveryVersion = result.versions[0]!
			await expect(
				ratifyCommercialTourPolicy({
					policyVersionId: recoveryVersion.id,
					approvalArea: "policy",
					approverUserId: reviewer,
					approvalReference: "Synthetic recovery without signatures",
					resumePublication: true,
				})
			).rejects.toThrow("commercial_policy_not_publishable")
			for (const approvalArea of ["policy", "finance", "tour_operations"] as const)
				await db
					.insert(CommercialPolicyApproval)
					.values({
						id: crypto.randomUUID(),
						policyVersionId: recoveryVersion.id,
						approvalArea,
						approverUserId: reviewer,
						approvalReference: `Existing synthetic ${approvalArea}`,
						approvedAt: new Date(),
					})
			const recovered = await ratifyCommercialTourPolicy({
				policyVersionId: recoveryVersion.id,
				approvalArea: "policy",
				approverUserId: reviewer,
				approvalReference: "Synthetic recovery preserving signatures",
				resumePublication: true,
			})
			expect(recovered.status).toBe("published")
			const preserved = await db
				.select()
				.from(CommercialPolicyApproval)
				.where(eq(CommercialPolicyApproval.policyVersionId, recoveryVersion.id))
			expect(preserved).toHaveLength(3)
			expect(
				preserved.every((signature) => signature.approvalReference.startsWith("Existing synthetic"))
			).toBe(true)
			for (const version of result.versions) {
				if (version.id === recoveryVersion.id) continue
				for (const approvalArea of ["policy", "finance", "tour_operations"] as const) {
					const approval = await ratifyCommercialTourPolicy({
						policyVersionId: version.id,
						approvalArea,
						approverUserId: reviewer,
						approvalReference: `Synthetic certification: ${approvalArea}`,
					})
					expect(approval.status).toBe(approvalArea === "tour_operations" ? "published" : "draft")
				}
				const [persisted] = await db
					.select()
					.from(CompliancePolicyVersion)
					.where(eq(CompliancePolicyVersion.id, version.id))
				expect(persisted?.status).toBe("published")
			}
			throw rollback
		})
	).rejects.toBe(rollback)
}, 120_000)
