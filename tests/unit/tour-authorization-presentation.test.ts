import { describe, expect, it, vi } from "vitest"
vi.mock("@/modules/financial/commercial-agreements", () => ({
	commercialAgreementStatus: async () => ({ state: "disabled", agreement: null }),
}))

vi.mock("@/container", () => ({
	productRepository: { getProductPublicationEligibility: async () => ({ eligible: true }) },
}))
vi.mock("@/lib/provider-governance", () => ({
	evaluateProviderGovernance: async () => ({
		capabilities: { publish: false },
		blockers: [
			{
				capabilities: ["publish"],
				label: "Registro fiscal verificado",
				href: "/provider/settings/verification",
			},
		],
	}),
}))
vi.mock("@/lib/verification/line-gate", () => ({
	loadProductLineGate: async () => ({ allowed: true, blockers: [] }),
}))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	resolveProductCommercialDiagnosis: async () => ({
		diagnosis: {
			capabilities: { publish: false },
			blockers: [
				{
					id: "policy_context_unsupported_product",
					capabilities: ["publish"],
					action: "Solicita revisión de políticas para esta combinación.",
				},
			],
		},
	}),
}))
import { loadTourAuthorization } from "@/lib/tours/loadTourAuthorization"
import * as lineGate from "@/lib/verification/line-gate"

describe("authorization copy uses the same responsibility as the diagnosis", () => {
	it("isolates a failed line read and never marks authorization ready", async () => {
		const spy = vi
			.spyOn(lineGate, "loadProductLineGate")
			.mockRejectedValueOnce(new Error("offline"))
		const result = await loadTourAuthorization({ providerId: "provider", productId: "tour" })
		expect(result.provider_authorization.ready).toBe(false)
		expect(result.experience_authorization.ready).toBe(false)
		expect(result.experience_authorization.code).toBe("read_failed")
		expect(result.decisions[1].status).toBe("No se pudo comprobar")
		expect(result.decisions[2].status).toBe("Contratación no habilitada")
		spy.mockRestore()
	})
	it("identifies missing verification evidence and explains the Fastt policy decision without asking the provider to complete it", async () => {
		const result = await loadTourAuthorization({ providerId: "provider", productId: "tour" })
		expect(result.provider_authorization.ready).toBe(false)
		expect(result.provider_authorization.message).toBe(
			"Requisitos pendientes: Registro fiscal verificado"
		)
		expect(result.experience_authorization.responsible).toBe("fastt")
		expect(result.experience_authorization.message).toBe(
			"Fastt debe revisar las políticas comerciales aplicables a esta combinación."
		)
		expect(result.experience_authorization.message).not.toContain("Solicita")
	})
})
