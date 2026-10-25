import { describe, expect, it } from "vitest"
import {
	commercialBlockerIsWaiting,
	tourCommercialAction,
} from "@/lib/tours/tourCommercialNavigation"

describe("commercial tasks remain separate from verification", () => {
	it.each([
		["collection_model_undecided", "Configurar cobro"],
		["agreement_proposal_required", "Solicitar propuesta"],
		["agreement_acceptance_required", "Revisar propuesta"],
		["agreement_expired", "Revisar acuerdo comercial"],
	])("offers an exact task for %s", (id, label) => {
		const action = tourCommercialAction(id, "experience-a")!
		expect(action.label).toBe(label)
		const target = new URL(action.href, "https://fastt.test")
		expect(target.pathname).toBe("/provider/settings/payments")
		expect(target.searchParams.get("productId")).toBe("experience-a")
		expect(target.searchParams.get("returnTo")).toBe("/product/experience-a/preview")
	})
	it.each([
		"policy_context_unsupported_product",
		"policy_context_conflict_tax",
		"policy_contract_empty",
		"agreement_proposal_requested",
		"agreement_not_started",
	])("does not ask the provider to resolve %s", (id) => {
		expect(commercialBlockerIsWaiting(id)).toBe(true)
		expect(tourCommercialAction(id, "experience-a")).toBeNull()
	})
	it("does not hide missing geographic data as an internal Fastt decision", () => {
		expect(commercialBlockerIsWaiting("policy_context_missing_product")).toBe(false)
		expect(tourCommercialAction("policy_context_missing_product", "experience-a")).toBeNull()
	})
})
