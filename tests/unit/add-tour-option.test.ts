import { expect, it } from "vitest"
import {
	optionWizardHref,
	optionWizardContext,
	optionNextHref,
	OPTION_STEPS,
	projectOptionWizardStages,
	optionStepLocked,
} from "@/lib/playbook/add-tour-option"
const context = {
	productId: "tour-a",
	sessionId: "session-a",
	variantId: "option-a",
	ratePlanId: "rate-a",
}
it("locks later steps until profile and rate exist", () => {
	expect(optionStepLocked("profile", null, null)).toBe(false)
	expect(optionStepLocked("price", null, null)).toBe(true)
	expect(optionStepLocked("conditions", "option-a", null)).toBe(true)
	expect(optionStepLocked("calendar", "option-a", "rate-a")).toBe(false)
})

it("projects five rail stages aligned with the active step", () => {
	const stages = projectOptionWizardStages(context, "price")
	expect(stages).toHaveLength(5)
	expect(stages.map((stage) => stage.label)).toEqual([
		"Configurar opción",
		"Precio",
		"Condiciones",
		"Fechas y cupos",
		"Revisar y activar",
	])
	expect(stages[0]?.state).toBe("ready")
	expect(stages[1]?.state).toBe("pending")
	expect(stages[1]?.href).toContain("step=price")
	const withoutRate = projectOptionWizardStages(
		{ ...context, ratePlanId: null },
		"profile",
	)
	expect(withoutRate[2]?.href).toBe("")
})

it("uses five explicit steps and preserves commercial selection in every destination", () => {
	expect(OPTION_STEPS.map((step) => step.id)).toEqual([
		"profile",
		"price",
		"conditions",
		"calendar",
		"review",
	])
	for (const step of OPTION_STEPS) {
		const url = new URL(optionWizardHref(context, step.id), "http://localhost")
		expect(optionWizardContext(url)).toEqual(context)
		expect(url.searchParams.get("step")).toBe(step.id)
	}
	expect(optionWizardHref(context, "calendar")).toContain("schedule=1")
	expect(optionWizardHref(context, "review")).toContain("/departures/option-a/review")
})
it("advances logically and returns a correction to review without joining launch-tour", () => {
	const source = new URLSearchParams({ sessionId: context.sessionId, playbook: "add-tour-option" })
	expect(optionNextHref(source, context, "departure")).toBe(optionWizardHref(context, "price"))
	expect(optionNextHref(source, context, "rate")).toBe(optionWizardHref(context, "conditions"))
	source.set("optionReturn", "review")
	expect(optionNextHref(source, context, "bookingPolicies")).toBe(
		optionWizardHref(context, "review")
	)
})

it("does not repair the independent option assistant into product preparation", async () => {
	const { getCompleteToPublishPlaybookRepairHref } =
		await import("@/lib/playbook/complete-to-publish")
	const url = new URL(optionWizardHref(context, "profile"), "http://localhost")
	expect(
		getCompleteToPublishPlaybookRepairHref(url, { isTour: true, productId: context.productId })
	).toBeNull()
})

it("binds the saved tariff in both the destination path and its query", async () => {
	const { readFileSync } = await import("node:fs")
	const page = readFileSync("src/pages/rates/plans/manage.astro", "utf8")
	expect(page).toContain('.replaceAll("__SAVED_RATE__",')
	const template = optionWizardHref({ ...context, ratePlanId: "__SAVED_RATE__" }, "conditions")
	const destination = new URL(template.replaceAll("__SAVED_RATE__", context.ratePlanId), "http://localhost")
	expect(destination.pathname).toBe(`/rates/plans/${context.ratePlanId}`)
	expect(optionWizardContext(destination)).toEqual(context)
})
