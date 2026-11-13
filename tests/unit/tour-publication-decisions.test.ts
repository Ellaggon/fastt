import { describe, expect, it } from "vitest"
import { projectAuthorizationDecisions } from "@/lib/tours/tourPublicationDecisions"
import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"

const capabilities = {
	publish: true,
	booking: true,
	collect_payment: true,
	payout: true,
	integrations: true,
}
const policy: CommercialPolicyDiagnosis = {
	policyStatus: "supported",
	capabilities,
	capabilityStates: {
		publish: "allowed",
		booking: "allowed",
		collect_payment: "allowed",
		payout: "allowed",
		integrations: "allowed",
	},
	blockers: [],
	satisfiedRequirements: [],
	policyVersionIds: ["approved"],
}
const base = {
	productId: "tour",
	policy,
	verification: { ready: true, labels: [] },
	agreement: { state: "active", hasProposal: true },
}

describe("publication decision read projection", () => {
	it("keeps the three authorization decisions separate and stable", () => {
		const rows = projectAuthorizationDecisions(base)
		expect(rows.map((r) => r.id)).toEqual(["admission", "verification", "agreement"])
		expect(rows.every((r) => r.tone === "success")).toBe(true)
	})
	it("never treats disabled contracting as a valid agreement", () => {
		const rows = projectAuthorizationDecisions({
			...base,
			agreement: { state: "disabled", hasProposal: false },
		})
		expect(rows[2].status).toBe("Contratación no habilitada")
		expect(rows[2].actions).toEqual([])
		expect(rows[0].tone).toBe("success")
	})
	it("does not request arbitrary documents when policy coverage is missing", () => {
		const rows = projectAuthorizationDecisions({
			...base,
			policy: {
				...policy,
				policyStatus: "unsupported",
				policyVersionIds: [],
				blockers: [
					{
						id: "policy_context_unsupported_product",
						capabilities: ["publish"],
						action: "Define policy",
						policyVersionId: null,
					},
				],
			},
		})
		expect(rows[0].status).toBe("Pendiente de Fastt")
		expect(rows[0].actions).toEqual([])
		expect(rows[1].status).toBe("Requisitos por definir")
		expect(rows[2].status).toBe("Vigente")
	})
	it("distinguishes deferred coverage from a coverage failure while the holder is under review", () => {
		const input: Parameters<typeof projectAuthorizationDecisions>[0] = {
			...base,
			policy: {
				...policy,
				policyStatus: "unsupported",
				policyVersionIds: [],
				blockers: [
					{
						id: "holder_declaration_in_review",
						capabilities: ["publish"],
						action: "La declaración del titular está en revisión.",
						policyVersionId: null,
					},
				],
			},
			verification: { ready: false, labels: ["La declaración del titular está en revisión."] },
		}
		const rows = projectAuthorizationDecisions(input)

		expect(rows[0].status).toBe("En espera de la declaración del titular")
		expect(rows[0].message).toContain("La cobertura aún no se evaluó")
		expect(rows[0].message).toContain("no significa que la cobertura haya sido rechazada")
		expect(rows[1].status).toBe("En revisión")
		const provisional = projectAuthorizationDecisions({ ...input, provisionalCoverage: policy })
		expect(provisional[0].status).toBe("Cobertura provisional")
		expect(provisional[0].tone).toBe("neutral")
		expect(provisional[1].status).toBe("En revisión")
		const failed = projectAuthorizationDecisions({ ...input, provisionalCoverage: null })
		expect(failed[0].status).toBe("No se pudo comprobar")
		const unconfigured = projectAuthorizationDecisions({
			...input,
			provisionalCoverage: {
				...policy,
				policyStatus: "unsupported",
				policyVersionIds: [],
				blockers: [
					{
						id: "policy_context_unsupported_product",
						capabilities: ["publish"],
						action: "Revisar política",
						policyVersionId: null,
						configurationReason: "missing",
					},
				],
			},
		})
		expect(unconfigured[0].status).toBe("Pendiente de Fastt")
		expect(unconfigured[1].status).toBe("En revisión")
	})
	it("isolates failed reads without manufacturing successful results", () => {
		const rows = projectAuthorizationDecisions({ ...base, policy: null, agreement: null })
		expect(rows[0].status).toBe("No se pudo comprobar")
		expect(rows[2].status).toBe("No se pudo comprobar")
		expect(rows.some((r) => r.tone === "success")).toBe(false)
	})
	it.each([
		"expired",
		"not_started",
		"review_required",
		"proposal_requested",
		"acceptance_required",
	])("does not mark %s agreements valid", (state) => {
		const row = projectAuthorizationDecisions({
			...base,
			agreement: { state, hasProposal: true },
		})[2]
		expect(row.tone).not.toBe("success")
	})
	it("pending evidence is a review, not a fresh upload request", () => {
		const rows = projectAuthorizationDecisions({
			...base,
			policy: {
				...policy,
				blockers: [
					{
						id: "license",
						capabilities: ["publish"],
						action: "Licencia en revisión",
						policyVersionId: "approved",
						evidenceState: "pending_review",
					},
				],
			},
		})
		expect(rows[1].status).toBe("En revisión")
		expect(rows[1].actions).toEqual([])
	})
})
