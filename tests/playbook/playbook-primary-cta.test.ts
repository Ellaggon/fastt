import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
	readPlaybookNavIntent,
	resolvePlaybookRedirectAfterSave,
} from "@/lib/playbook/playbook-nav"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("playbook primary CTA contract", () => {
	const layout = read("src/layouts/PlaybookLayout.astro")

	it("does not keep a skip-save Continuar next to a form Guardar y continuar", () => {
		expect(layout).toContain("continueFormId")
		expect(layout).toContain("ownsPrimaryCta")
		expect(layout).toContain("Dejar para más tarde")
		expect(layout).toContain('value="continue"')
		expect(layout).toContain("Guardar y continuar")
		expect(layout).not.toContain("Salir del flujo")
	})

	it("binds product form steps to the playbook footer instead of duplicating continue", () => {
		const images = read("src/pages/product/[id]/images.astro")
		const content = read("src/pages/product/[id]/content.astro")
		const location = read("src/pages/product/[id]/location.astro")
		const subtype = read("src/pages/product/[id]/subtype.astro")
		expect(images).toContain('continueFormId={playbook.active ? "imagesForm" : null}')
		expect(content).toContain('continueFormId={playbookResolved.active ? "contentForm" : null}')
		expect(location).toContain('continueFormId={playbook.active ? "locationForm" : null}')
		expect(subtype).toContain('continueFormId={playbook.active ? "subtypeForm" : null}')
		expect(images).toContain("playbook.active ? \"hidden\"")
	})

	it("keeps editor-owned steps without a second footer continue", () => {
		const tickets = read("src/pages/product/[id]/tickets.astro")
		const departures = read("src/pages/product/[id]/departures/new.astro")
		expect(tickets).toContain("ownsPrimaryCta={tourPlaybook.active}")
		expect(departures).toContain("ownsPrimaryCta={tourPlaybook.active}")
	})

	it("sends Guardar y continuar forward and Dejar para más tarde back to the product", () => {
		const continueData = new FormData()
		continueData.set("playbook", "complete-to-publish")
		continueData.set("flow", "complete")
		expect(
			resolvePlaybookRedirectAfterSave(continueData, {
				productId: "p1",
				launchPath: "/product/p1/subtype",
				launchStep: "subtype",
				intent: "continue",
			})
		).toContain("preview")

		const exitData = new FormData()
		exitData.set("playbook", "complete-to-publish")
		exitData.set("playbookNav", "exit")
		expect(readPlaybookNavIntent(exitData)).toBe("exit")
		expect(
			resolvePlaybookRedirectAfterSave(exitData, {
				productId: "p1",
				launchPath: "/product/p1/subtype",
				launchStep: "subtype",
			})
		).toBe("/product/p1")
	})
})
