import {
	db,
	eq,
	and,
	CompliancePolicySet,
	DocumentDefinition,
	DocumentDefinitionVersion,
	CommercialPolicyApproval,
} from "@/shared/infrastructure/db/compat"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import {
	createDocumentDefinitionDraft,
	transitionDocumentDefinition,
} from "@/lib/documents/document-definitions"
import { createCommercialPolicyDraft, addCommercialPolicyDraftRule } from "./policy-drafts"
import { prepareLaPazReviewPackage } from "./la-paz-review-package"
import { prepareLaPazPolicyForms } from "./la-paz-policy-forms"
import { documentCaptureSchema } from "@/shared/domain/document-definition"

/** Authorized administrative caller only. Never ratifies or publishes policies. */
export async function loadLaPazPolicyDrafts(effectiveFrom: string) {
	return withPostgresTransaction(async () => {
		const existing = await db
			.select({ key: CompliancePolicySet.key })
			.from(CompliancePolicySet)
			.where(
				and(
					eq(CompliancePolicySet.vertical, "tour"),
					eq(CompliancePolicySet.policyScope, "commercial")
				)
			)
		if (existing.some((row) => row.key.includes("la_paz_urban_")))
			throw new Error("la_paz_package_exists_review_before_reloading")
		const review = prepareLaPazReviewPackage()
		const mapping = new Map<string, string>()
		for (const definition of review.definitions) {
			const versions = await db
				.select({ version: DocumentDefinitionVersion })
				.from(DocumentDefinition)
				.innerJoin(
					DocumentDefinitionVersion,
					eq(DocumentDefinitionVersion.definitionId, DocumentDefinition.id)
				)
				.where(eq(DocumentDefinition.key, definition.key))
			if (versions.length) {
				const published = versions.filter((row) => row.version.status === "published")
				const reusable = published.length === 1 ? published[0]?.version : null
				if (
					!reusable ||
					reusable.label !== definition.label ||
					reusable.description !== definition.description ||
					reusable.family !== definition.family ||
					JSON.stringify(documentCaptureSchema.parse(reusable.captureJson)) !==
						JSON.stringify(definition.capture)
				)
					throw new Error("la_paz_definition_requires_manual_reconciliation")
				mapping.set(definition.key, reusable.id)
			} else {
				const created = await createDocumentDefinitionDraft(definition)
				await transitionDocumentDefinition(created.id, "publish")
				mapping.set(definition.key, created.id)
			}
		}
		const versions: { id: string; code: string }[] = []
		let rules = 0
		for (const { form, rule } of prepareLaPazPolicyForms(effectiveFrom, mapping)) {
			const draft = await createCommercialPolicyDraft(form)
			if (
				draft.status !== "draft" ||
				draft.approvedBy ||
				draft.approvedAt ||
				draft.approvalReference
			)
				throw new Error("la_paz_unexpected_approval_state")
			if (rule) {
				rule.set("versionId", draft.id)
				await addCommercialPolicyDraftRule(rule)
				rules++
			}
			const signatures = await db
				.select({ id: CommercialPolicyApproval.id })
				.from(CommercialPolicyApproval)
				.where(eq(CommercialPolicyApproval.policyVersionId, draft.id))
			if (signatures.length) throw new Error("la_paz_unexpected_signatures")
			versions.push({ id: draft.id, code: String(form.get("policyCode")) })
		}
		return {
			status: "draft",
			definitions: [...mapping.values()],
			versions,
			rules,
			approvals: 0,
			provisionalEffectiveFrom: effectiveFrom,
		}
	})
}
