import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { buildInviteLifecycleProgress } from "@/lib/provider-permissions"
import {
	providerComplianceRejectCategories,
	resolveProviderRejectCategory,
} from "@/lib/provider-reject-categories"
import { buildRequiredKycSlots } from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S3-3 invite live stepper + host reject categories", () => {
	it("builds live invite progress and supports resend when expired", () => {
		const pending = buildInviteLifecycleProgress({
			status: "pending",
			expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
		})
		expect(pending.currentStepId).toBe("email")
		expect(pending.canResend).toBe(true)
		expect(pending.isExpired).toBe(false)
		expect(pending.steps.find((step) => step.id === "email")?.state).toBe("current")
		expect(pending.steps.find((step) => step.id === "invite")?.state).toBe("complete")

		const expired = buildInviteLifecycleProgress({
			status: "pending",
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
		})
		expect(expired.isExpired).toBe(true)
		expect(expired.phaseLabel).toBe("Expirada")
		expect(expired.steps.find((step) => step.id === "email")?.state).toBe("blocked")
		expect(expired.canResend).toBe(true)

		const accepted = buildInviteLifecycleProgress({
			status: "accepted",
			acceptedAt: new Date().toISOString(),
		})
		expect(accepted.currentStepId).toBe("access")
		expect(accepted.canResend).toBe(false)
		expect(accepted.steps.every((step) => step.state === "complete")).toBe(true)
	})

	it("resolves admin reject templates into host-facing categories", () => {
		const docTemplate = providerComplianceRejectCategories.find((item) => item.id === "doc_illegible")
		expect(docTemplate).toBeTruthy()
		const matched = resolveProviderRejectCategory(docTemplate!.body, "documents")
		expect(matched.matched).toBe(true)
		expect(matched.label).toBe("Documento ilegible / incompleto")
		expect(matched.id).toBe("doc_illegible")

		const freeText = resolveProviderRejectCategory("Motivo libre del revisor", "documents")
		expect(freeText.matched).toBe(false)
		expect(freeText.body).toContain("Motivo libre")

		const slots = buildRequiredKycSlots({
			documents: [
				{
					id: "d1",
					providerId: "p1",
					type: "government_id",
					typeLabel: "ID",
					status: "rejected",
					statusLabel: "Rechazado",
					tone: "error",
					fileUrl: null,
					fileName: "id.pdf",
					mimeType: "application/pdf",
					sizeBytes: 10,
					submissionNotes: null,
					reviewNotes: docTemplate!.body,
					reviewedAt: null,
					reviewedBy: null,
					createdAt: null,
					updatedAt: null,
				},
			],
		})
		const rejected = slots.find((slot) => slot.type === "government_id")
		expect(rejected?.rejectCategoryLabel).toBe("Documento ilegible / incompleto")
	})

	it("wires team stepper/resend and host reject category UI", () => {
		const team = read("src/pages/provider/settings/team.astro")
		const api = read("src/pages/api/provider/settings/invitations.ts")
		const stepper = read("src/components/provider/ProviderInviteLifecycleStepper.astro")
		const kyc = read("src/components/provider/ProviderKycSlotsCard.astro")
		const verification = read("src/components/provider/ProviderVerificationView.astro")
		const adminLib = read("src/lib/provider-admin-compliance.ts")

		expect(team).toContain("buildInviteLifecycleProgress")
		expect(team).toContain("ProviderInviteLifecycleStepper")
		expect(team).toContain("data-invite-resend")
		expect(team).toContain('value="resend"')
		expect(team).toContain("<details")
		expect(team).toContain("Ciclo de la invitación")

		expect(api).toContain('action === "resend"')
		expect(api).toContain("provider.invitation.resend")
		expect(api).toContain("resent")

		expect(stepper).toContain("data-invite-lifecycle-stepper")
		expect(kyc).toContain("rejectCategoryLabel")
		expect(verification).toContain("resolveProviderRejectCategory")
		expect(verification).toContain("data-reject-category")
		expect(adminLib).toContain('from "@/lib/provider-reject-categories"')
	})
})
