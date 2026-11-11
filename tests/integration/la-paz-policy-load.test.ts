import { expect, it } from "vitest"
import { loadLaPazPolicyDrafts } from "@/lib/commercial-policy/la-paz-policy-load"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { ensureOperatingGeographyFixtures } from "../test-support/operating-geography"
import { setCommercialPolicyDraftStart } from "@/lib/commercial-policy/policy-drafts"
import { db, eq, CompliancePolicyVersion, CommercialPolicyApproval } from "@/shared/infrastructure/db/compat"
import { upsertTestUser } from "@/shared/infrastructure/test-support/db-test-data"

it("loads the administrative package atomically without signatures and rejects a duplicate load", async () => {
	await ensureOperatingGeographyFixtures()
	const rollback = new Error("rollback_completed_package_test")
	await expect(withPostgresTransaction(async () => {
		const result = await loadLaPazPolicyDrafts("2026-11-09")
		expect(result.status).toBe("draft")
		expect(result.definitions).toHaveLength(7)
		expect(result.versions).toHaveLength(18)
		expect(result.rules).toBe(16)
		expect(result.approvals).toBe(0)
		const versionId = result.versions[0]!.id
		await setCommercialPolicyDraftStart(versionId,"2026-11-10")
		const [scheduled] = await db.select().from(CompliancePolicyVersion).where(eq(CompliancePolicyVersion.id,versionId))
		expect(scheduled?.effectiveFrom.toISOString()).toBe("2026-11-10T00:00:00.000Z")
		await upsertTestUser({id:"schedule-test-reviewer",email:"schedule-reviewer@example.invalid"})
		await db.insert(CommercialPolicyApproval).values({id:crypto.randomUUID(),policyVersionId:versionId,approvalArea:"policy",approverUserId:"schedule-test-reviewer",approvalReference:"Synthetic scheduling lock test",approvedAt:new Date()})
		await expect(setCommercialPolicyDraftStart(versionId,"2026-11-11")).rejects.toThrow("signed_policy_immutable")
		await expect(loadLaPazPolicyDrafts("2026-11-09")).rejects.toThrow("la_paz_package_exists_review_before_reloading")
		throw rollback
	})).rejects.toBe(rollback)
})
