import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import {
	db,
	sql,
	inArray,
	CommercialPolicyApproval,
	CompliancePolicyVersion,
} from "@/shared/infrastructure/db/compat"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { upsertTestUser } from "@/shared/infrastructure/test-support/db-test-data"
import { loadLaPazPolicyDrafts } from "@/lib/commercial-policy/la-paz-policy-load"
import {
	previewCommercialPolicyPackage,
	ratifyCommercialPolicyPackage,
} from "@/lib/commercial-policy/package-ratification"
import { setCommercialPolicyDraftStart } from "@/lib/commercial-policy/policy-drafts"
import { transitionDocumentDefinition } from "@/lib/documents/document-definitions"
import { ensureOperatingGeographyFixtures } from "../test-support/operating-geography"

async function isolated(
	work: (loaded: Awaited<ReturnType<typeof loadLaPazPolicyDrafts>>, actor: string) => Promise<void>
) {
	await ensureOperatingGeographyFixtures()
	const rollback = new Error("rollback_package_certification")
	await expect(
		withPostgresTransaction(async () => {
			await db.execute(
				sql.raw(
					readFileSync("db/migrations/2026-11-10_versioned_policy_publication_guard.sql", "utf8")
				)
			)
			const actor = "synthetic-package-reviewer"
			await upsertTestUser({ id: actor, email: "package-reviewer@example.invalid" })
			await work(await loadLaPazPolicyDrafts("2026-11-10"), actor)
			throw rollback
		})
	).rejects.toBe(rollback)
}

it(
	"previews without signatures, rejects stale contracts, and publishes once with replay protection",
	async () =>
		isolated(async (loaded, actor) => {
			const versionIds = loaded.versions.map((version) => version.id)
			const preview = await previewCommercialPolicyPackage(versionIds)
			expect(preview.versions).toHaveLength(18)
			expect(
				await db
					.select()
					.from(CommercialPolicyApproval)
					.where(inArray(CommercialPolicyApproval.policyVersionId, versionIds))
			).toHaveLength(0)
			const params = {
				versionIds,
				fingerprint: preview.fingerprint,
				approvalReference: "Synthetic package authorization",
				approverUserId: actor,
				idempotencyKey: crypto.randomUUID(),
				reviewedAreas: ["policy", "finance", "tour_operations"],
			}
			await expect(
				ratifyCommercialPolicyPackage({ ...params, reviewedAreas: ["policy", "policy", "policy"] })
			).rejects.toThrow("policy_package_invalid")
			await setCommercialPolicyDraftStart(versionIds[0]!, "2026-11-11")
			await expect(
				withPostgresTransaction(() => ratifyCommercialPolicyPackage(params), { savepoint: true })
			).rejects.toThrow("policy_package_changed")
			const fresh = await previewCommercialPolicyPackage(versionIds)
			params.fingerprint = fresh.fingerprint
			expect(await ratifyCommercialPolicyPackage(params)).toEqual({
				ok: true,
				publishedVersions: 18,
			})
			expect(
				await ratifyCommercialPolicyPackage({ ...params, versionIds: [...versionIds].reverse() })
			).toEqual({ ok: true, publishedVersions: 18 })
			expect(
				await db
					.select()
					.from(CommercialPolicyApproval)
					.where(inArray(CommercialPolicyApproval.policyVersionId, versionIds))
			).toHaveLength(54)
			expect(
				(
					await db
						.select()
						.from(CompliancePolicyVersion)
						.where(inArray(CompliancePolicyVersion.id, versionIds))
				).every((version) => version.status === "published")
			).toBe(true)
			await expect(
				ratifyCommercialPolicyPackage({
					...params,
					approvalReference: "Different authorization with same key",
				})
			).rejects.toThrow("different command payload")
		}),
	120_000
)

it(
	"rolls back every signature when a referenced definition is no longer published",
	async () =>
		isolated(async (loaded, actor) => {
			const versionIds = loaded.versions.map((version) => version.id)
			const preview = await previewCommercialPolicyPackage(versionIds)
			await transitionDocumentDefinition(loaded.definitions[0]!, "retire")
			await expect(
				withPostgresTransaction(
					() =>
						ratifyCommercialPolicyPackage({
							versionIds,
							fingerprint: preview.fingerprint,
							approvalReference: "Synthetic failed package authorization",
							approverUserId: actor,
							idempotencyKey: crypto.randomUUID(),
							reviewedAreas: ["policy", "finance", "tour_operations"],
						}),
					{ savepoint: true }
				)
			).rejects.toThrow("commercial_policy_not_publishable")
			expect(
				await db
					.select()
					.from(CommercialPolicyApproval)
					.where(inArray(CommercialPolicyApproval.policyVersionId, versionIds))
			).toHaveLength(0)
			expect(
				(
					await db
						.select()
						.from(CompliancePolicyVersion)
						.where(inArray(CompliancePolicyVersion.id, versionIds))
				).every((version) => version.status === "draft")
			).toBe(true)
		}),
	120_000
)
