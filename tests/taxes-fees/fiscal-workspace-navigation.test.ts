import { expect, test } from "vitest"

import {
	fiscalWorkspaceScopeHref,
	fiscalWorkspaceTabFromPathname,
	fiscalWorkspaceTabHref,
} from "@/lib/taxes-fees/fiscal-workspace-navigation"

const definitionsHref = "/provider/settings/tax-fees"
const simulatorHref = "/provider/settings/tax-fees/simulator"
const assignmentsHref = "/provider/settings/tax-fees/assignments"

test("the simulator tab does not inherit a definition opened in Definiciones", () => {
	const search = new URLSearchParams(
		"edit=dc2597dc-f070-4668-a3f3-6304747ec8d8&review=1&scope=product-1"
	)

	expect(
		fiscalWorkspaceTabHref({
			href: simulatorHref,
			tab: "simulator",
			active: "definitions",
			search,
		})
	).toBe(`${simulatorHref}?scope=product-1`)
	expect(
		fiscalWorkspaceTabHref({
			href: definitionsHref,
			tab: "definitions",
			active: "definitions",
			search,
		})
	).toBe(`${definitionsHref}?scope=product-1&edit=dc2597dc-f070-4668-a3f3-6304747ec8d8&review=1`)
})

test("the simulator tab does not inherit a manual certification deep link from another tab", () => {
	const search = new URLSearchParams(
		"definitionId=dc2597dc-f070-4668-a3f3-6304747ec8d8&mode=manual&returnTo=%2Fprovider%2Fsettings%2Ftax-fees%3Fedit%3Ddc2597dc-f070-4668-a3f3-6304747ec8d8%26review%3D1"
	)

	expect(
		fiscalWorkspaceTabHref({
			href: simulatorHref,
			tab: "simulator",
			active: "definitions",
			search,
		})
	).toBe(simulatorHref)
	expect(
		fiscalWorkspaceTabHref({
			href: assignmentsHref,
			tab: "assignments",
			active: "simulator",
			search,
		})
	).toBe(assignmentsHref)
})

test("staying on the simulator keeps an explicit definitionId deep link", () => {
	const search = new URLSearchParams(
		"definitionId=fee-1&mode=manual&returnTo=/provider/settings/tax-fees?edit=fee-1"
	)

	expect(
		fiscalWorkspaceTabHref({
			href: simulatorHref,
			tab: "simulator",
			active: "simulator",
			search,
		})
	).toBe(`${simulatorHref}?definitionId=fee-1&mode=manual&returnTo=%2Fprovider%2Fsettings%2Ftax-fees%3Fedit%3Dfee-1`)
})

test("changing commercial scope keeps only the current tab query", () => {
	expect(
		fiscalWorkspaceScopeHref({
			pathname: simulatorHref,
			search: new URLSearchParams("definitionId=fee-1&mode=manual&edit=fee-1&review=1"),
			scopeId: "product-1",
		})
	).toBe(`${simulatorHref}?definitionId=fee-1&mode=manual&scope=product-1`)
	expect(
		fiscalWorkspaceScopeHref({
			pathname: definitionsHref,
			search: new URLSearchParams("edit=fee-1&review=1&definitionId=fee-1&mode=manual"),
			scopeId: null,
		})
	).toBe(`${definitionsHref}?edit=fee-1&review=1`)
})

test("pathnames map to the fiscal workspace tab they belong to", () => {
	expect(fiscalWorkspaceTabFromPathname("/provider/settings/tax-fees")).toBe("definitions")
	expect(fiscalWorkspaceTabFromPathname("/provider/settings/tax-fees/simulator/")).toBe("simulator")
	expect(fiscalWorkspaceTabFromPathname("/provider/settings/tax-fees/assignments")).toBe(
		"assignments"
	)
	expect(fiscalWorkspaceTabFromPathname("/provider/settings/tax-fees/activity")).toBe("activity")
})
