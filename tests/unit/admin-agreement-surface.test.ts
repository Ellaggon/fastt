import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/verification/commercial-lines", () => ({ listProviderCommercialLines: vi.fn() }))
vi.mock("@/modules/financial/commercial-agreements", () => ({ commercialAgreementStatus: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", () => ({ db: {}, desc: vi.fn(), eq: vi.fn() }))
vi.mock("@/shared/infrastructure/db/schema/tables", () => ({ ProviderCommercialAgreement: {} }))
import { adminAgreementPresentation } from "@/lib/commercial-policy/admin-agreement-surface"
describe("admin agreement next action", () => {
	it.each([
		["acceptance_required", undefined, "Sin propuesta", false],
		["proposal_requested", "requested", "Propuesta solicitada", true],
		["acceptance_required", "offered", "Pendiente del representante", false],
		["active", "accepted", "Acuerdo vigente", false],
		["expired", "accepted", "Acuerdo vencido", false],
		["not_started", "accepted", "Vigencia pendiente", false],
		["review_required", "accepted", "Requiere revisión", false],
		["acceptance_required", "withdrawn", "Propuesta retirada", false],
	] as const)(
		"presents %s / %s without confusing authorization and acceptance",
		(state, status, label, actionable) => {
			expect(adminAgreementPresentation("property_collect", state, status)).toMatchObject({
				label,
				actionable,
			})
		}
	)
	it("requires the provider declaration before preparing any proposal", () => {
		expect(adminAgreementPresentation("undecided", "acceptance_required")).toMatchObject({
			label: "Cobro sin confirmar",
			actionable: false,
		})
	})
	it("does not hide a renewal request behind an existing valid agreement", () => {
		expect(adminAgreementPresentation("property_collect", "active", "requested").action).toBe(
			"Preparar propuesta"
		)
	})
})
