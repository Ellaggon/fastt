import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import CaseNextAction from "@/components/admin/cases/CaseNextAction.astro"

const props = {
	caseId: "case-a",
	caseVersion: 3,
	status: "open",
	commandsEnabled: true,
	caseInPilot: true,
	canAssignCase: true,
	hasUnassignedTask: true,
	pendingDecisionReview: false,
	legacyReviewHref: null as string | null,
}
async function render(overrides: Partial<typeof props> = {}) {
	const container = await AstroContainer.create()
	return container.renderToString(CaseNextAction, { props: { ...props, ...overrides } })
}

describe("case next action availability", () => {
	it("explains environment read-only mode and offers the authorized review route", async () => {
		const html = await render({
			commandsEnabled: false,
			legacyReviewHref: "/admin/providers?filter=documents&providerId=provider-a",
		})
		expect(html).toContain("modo consulta en este entorno")
		expect(html).toContain("Continuar revisión del área")
		expect(html).toContain("confirmar MFA")
		expect(html).not.toContain("no tiene permiso")
		expect(html).not.toContain("data-case-command")
	})
	it("does not offer an unavailable legacy writer", async () => {
		const html = await render({ commandsEnabled: false })
		expect(html).not.toContain("Continuar revisión del área")
		expect(html).not.toContain("Tomar caso")
	})
	it("distinguishes pilot scope from assignment permission", async () => {
		const outsidePilot = await render({ caseInPilot: false })
		expect(outsidePilot).toContain("proveedor aún no están habilitadas")
		expect(outsidePilot).not.toContain("no tiene permiso")
		const denied = await render({ canAssignCase: false })
		expect(denied).toContain("no tiene permiso para asignarlo")
		expect(denied).not.toContain("data-case-command")
	})
	it("renders the versioned assignment command only when available", async () => {
		const html = await render()
		expect(html).toContain('data-endpoint="/api/admin/v1/cases/case-a/assign"')
		expect(html).toContain('name="caseVersion" value="3"')
		expect(html).toContain("Tomar caso")
	})
	it("does not offer assignment when active tasks already have owners", async () => {
		const html = await render({ hasUnassignedTask: false })
		expect(html).toContain("ya tienen responsable")
		expect(html).not.toContain("data-case-command")
	})
	it.each([
		{ status: "resolved", pendingDecisionReview: false },
		{ status: "waiting_information", pendingDecisionReview: false },
		{ status: "in_review", pendingDecisionReview: true },
	])("does not bypass case state through another review panel: %j", async (state) => {
		const html = await render({
			...state,
			legacyReviewHref: "/admin/providers?filter=verification&providerId=provider-a",
		})
		expect(html).not.toContain("data-case-command")
		expect(html).not.toContain("Continuar revisión del área")
	})
})
