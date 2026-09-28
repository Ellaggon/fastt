import { describe, expect, it } from "vitest"

import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"
import { buildTourVerificationReadiness } from "@/lib/provider-tour-verification"

const product = { id: "tour-1", name: "Ruta del Valle", publicationState: "draft" }

function diagnosis(overrides: Partial<CommercialPolicyDiagnosis> = {}): CommercialPolicyDiagnosis {
	return {
		policyStatus: "supported",
		capabilities: {
			publish: false,
			booking: false,
			collect_payment: false,
			payout: false,
			integrations: false,
		},
		capabilityStates: {
			publish: "blocked",
			booking: "blocked",
			collect_payment: "not_applicable",
			payout: "not_applicable",
			integrations: "blocked",
		},
		blockers: [],
		satisfiedRequirements: [],
		policyVersionIds: [],
		...overrides,
	}
}

describe("tour verification readiness", () => {
	it("does not ask for a Fastt payout account when this tour uses direct collection", () => {
		const result = buildTourVerificationReadiness({ product, diagnosis: diagnosis() })
		expect(result.paymentLabel).toBe("Cobro directo del proveedor")
		expect(result.paymentBody).toContain("no cobra ni liquida")
	})

	it("sends a missing scoped requirement to the exact experience evidence flow", () => {
		const result = buildTourVerificationReadiness({
			product,
			diagnosis: diagnosis({
				blockers: [
					{
						id: "requirement_tour-insurance",
						capabilities: ["publish", "booking"],
						action: "Carga el seguro.",
						policyVersionId: "policy-1",
						evidenceState: "out_of_scope",
					},
				],
			}),
		})
		expect(result.state).toBe("action_needed")
		expect(result.action?.href).toContain("scopeProductId=tour-1")
		expect(result.action?.href).toContain("returnTo=%2Fproduct%2Ftour-1%2Fpreview")
		expect(result.body).toContain("no cubre esta experiencia")
	})

	it("keeps a submitted requirement in review and does not offer a replacement upload", () => {
		const result = buildTourVerificationReadiness({
			product,
			diagnosis: diagnosis({
				blockers: [
					{
						id: "requirement_operator-license",
						capabilities: ["publish"],
						action: "Carga la licencia.",
						policyVersionId: "policy-1",
						evidenceState: "pending_review",
					},
				],
			}),
		})
		expect(result.state).toBe("in_review")
		expect(result.action).toBeNull()
	})

	it("does not tell the provider to upload evidence while Fastt lacks a ratified policy", () => {
		const result = buildTourVerificationReadiness({
			product,
			diagnosis: diagnosis({
				policyStatus: "unsupported",
				blockers: [
					{
						id: "policy_context_unsupported_product",
						capabilities: ["publish", "booking"],
						action: "Solicita revisión.",
						policyVersionId: null,
					},
				],
			}),
		})
		expect(result.state).toBe("waiting_on_fastt")
		expect(result.action).toBeNull()
		expect(result.body).toContain("No subas documentos adicionales")
	})

	it("separates explicit account reuse from evidence that belongs to this experience", () => {
		const result = buildTourVerificationReadiness({
			product,
			diagnosis: diagnosis({
				capabilities: {
					publish: true,
					booking: true,
					collect_payment: false,
					payout: false,
					integrations: true,
				},
				capabilityStates: {
					publish: "allowed",
					booking: "allowed",
					collect_payment: "not_applicable",
					payout: "not_applicable",
					integrations: "allowed",
				},
				satisfiedRequirements: [
					{
						key: "holder-identity",
						evidenceId: "doc-account",
						policyVersionId: "policy-1",
						evidenceScope: "provider",
					},
					{
						key: "tour-license",
						evidenceId: "doc-covered",
						policyVersionId: "policy-1",
						evidenceScope: "product",
					},
				],
			}),
		})
		expect(result.state).toBe("ready")
		expect(result.reusedAccountEvidenceCount).toBe(1)
		expect(result.experienceEvidenceCount).toBe(1)
	})
})
