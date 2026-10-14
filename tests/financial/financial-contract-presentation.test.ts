import { describe, expect, it } from "vitest"
import {
	presentFinancialContract,
	groupFinancialContractReasons,
} from "@/lib/commercial-policy/financial-contract-presentation"
import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"
import { safeFinancialReturn } from "@/lib/financial/financialReturn"
import { financialNavigationFor } from "@/lib/financial/financialNavigation"
const diagnosis = (
	overrides: Partial<CommercialPolicyDiagnosis> = {}
): CommercialPolicyDiagnosis => ({
	policyStatus: "supported",
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
	blockers: [],
	satisfiedRequirements: [],
	policyVersionIds: ["signed"],
	...overrides,
})
const present = (d: CommercialPolicyDiagnosis, extra: Record<string, unknown> = {}) =>
	presentFinancialContract({
		diagnosis: d,
		collectionModel: "property_collect",
		line: "tour",
		productId: "experience-a",
		returnTo: "/financial?scope=tour&productId=experience-a",
		...extra,
	})
describe("financial commercial presentation", () => {
	it("direct collection satisfies applicable requirements without enabling Fastt money execution", () => {
		const result = present(diagnosis())
		expect(result.status).toBe("requirements_satisfied")
		expect(result.statusLabel).not.toContain("Contrato aprobado")
		expect(result.detail).toContain("directamente")
	})
	it("does not open unsupported formats merely because they use the tour vertical", () => {
		expect(
			present(
				diagnosis({
					policyStatus: "unsupported",
					blockers: [
						{
							id: "policy_context_unsupported_product",
							capabilities: ["booking"],
							action: "Solicita revisión",
							policyVersionId: null,
						},
					],
				})
			).status
		).toBe("unsupported")
	})
	it("an undecided experience requires an agreement, not a provider declaration bypass", () => {
		const result = present(
			diagnosis({
				blockers: [
					{
						id: "collection_model_undecided",
						capabilities: ["collect_payment"],
						action: "Confirma quién cobra",
						policyVersionId: null,
					},
				],
			}),
			{ collectionModel: "undecided" }
		)
		expect(result.status).toBe("unsupported")
		expect(result.primaryAction?.href).toContain("/provider/support")
	})
	it("only a submitted review is shown as in review", () => {
		const missing = {
			id: "requirement_identity",
			capabilities: ["booking" as const],
			action: "Completa identidad",
			policyVersionId: "v",
			evidenceState: "missing" as const,
		}
		expect(present(diagnosis({ blockers: [missing] })).status).toBe("action_required")
		expect(
			present(diagnosis({ blockers: [{ ...missing, evidenceState: "pending_review" }] })).status
		).toBe("in_review")
	})
	it("carries the original corrective action to fiscal evidence and preserves return", () => {
		const result = present(
			diagnosis({
				blockers: [
					{
						id: "requirement_tax",
						capabilities: ["booking"],
						action: "Revisa tu documento fiscal",
						policyVersionId: "v",
						evidenceState: "rejected",
					},
				],
				applicableRequirements: [
					{
						key: "tax",
						capabilities: ["booking"],
						acceptedEvidence: ["tax_document"],
						required: true,
						blockingAction: "Revisa tu documento fiscal",
						reviewOwner: "finance",
						policyVersionId: "v",
					},
				],
			})
		)
		const href = new URL(result.primaryAction!.href, "http://local")
		expect(href.searchParams.get("tab")).toBe("fiscal")
		expect(href.searchParams.get("experience")).toBe("experience-a")
		expect(href.searchParams.get("returnTo")).toBe("/financial?scope=tour&productId=experience-a")
		expect(result.reasons[0].message).toBe("Revisa tu documento fiscal")
	})
	it("groups only equal causes and keeps distinct policy or destination separate", () => {
		const reason = {
			code: "agreement",
			message: "Consultar condiciones",
			owner: "fastt" as const,
			policyVersionId: "v",
			action: { label: "Consultar", href: "/provider/support" },
		}
		const grouped = groupFinancialContractReasons([
			{ productId: "a", name: "A", reasons: [reason] },
			{ productId: "b", name: "B", reasons: [reason] },
			{ productId: "c", name: "C", reasons: [{ ...reason, policyVersionId: "different" }] },
		])
		expect(grouped).toHaveLength(2)
		expect(grouped[0].offerings.map((r) => r.productId)).toEqual(["a", "b"])
	})
})
it("financial return allows known routes and rejects external, backslash and unrelated routes", () => {
	expect(safeFinancialReturn("/financial/refunds?scope=tour&productId=a&search=abc")).toBe(
		"/financial/refunds?scope=tour&productId=a&search=abc"
	)
	for (const path of [
		"https://bad.test",
		"//bad.test",
		"/\\bad.test",
		"/financial-evil",
		"/product/a",
	])
		expect(safeFinancialReturn(path)).toBeNull()
})
it("experience navigation prioritizes daily work while all destinations remain reachable", () => {
	const items = financialNavigationFor("tour")
	expect(items.filter((r) => !r.secondary).map((r) => r.label)).toEqual([
		"Pendientes",
		"Cobros",
		"Devoluciones",
	])
	expect(items).toHaveLength(6)
	expect(financialNavigationFor("hotel").every((r) => !r.secondary)).toBe(true)
})

it("combines equivalent unsupported jurisdictions while retaining every cause and country boundary", () => {
	const base = {
		message: "Solicita revisión",
		owner: "fastt" as const,
		policyVersionId: null,
		action: { label: "Consultar", href: "/provider/support" },
	}
	const grouped = groupFinancialContractReasons([
		{
			productId: "a",
			name: "A",
			country: "BO",
			commercialLine: "tour",
			reasons: [
				{ ...base, code: "policy_context_unsupported_holder" },
				{ ...base, code: "policy_context_unsupported_tax" },
			],
		},
		{
			productId: "b",
			name: "B",
			country: "PE",
			commercialLine: "tour",
			reasons: [{ ...base, code: "policy_context_unsupported_holder" }],
		},
	])
	expect(grouped).toHaveLength(2)
	expect(grouped[0].causes.map((c) => c.code)).toEqual([
		"policy_context_unsupported_holder",
		"policy_context_unsupported_tax",
	])
})
