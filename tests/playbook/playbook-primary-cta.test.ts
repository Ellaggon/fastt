import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
	isCompleteToPublishPlaybookMode,
	readPlaybookNavIntent,
	resolvePlaybookRedirectAfterSave,
} from "@/lib/playbook/playbook-nav"
import { resolveCompleteToPublishPlaybookFromUrl } from "@/lib/playbook/complete-to-publish"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("playbook primary CTA contract", () => {
	it("keeps an explicit preparation form identity when a legacy flow value remains", () => {
		const form = new FormData()
		form.set("playbook", "launch-tour")
		form.set("flow", "complete")
		expect(isCompleteToPublishPlaybookMode(form)).toBe(false)
		form.set("playbook", "complete-to-publish")
		expect(isCompleteToPublishPlaybookMode(form)).toBe(true)
	})
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
		expect(images).toContain('name="playbookCurrentStep"')
		expect(images).toContain("continueDisabled={enforceTourPublicationGallery")
		expect(images).toContain("necesarias para publicar")
		expect(images).not.toContain(
			'buildCompleteToPublishHref(`/product/${productId}/preview`, "preview")'
		)
		expect(content).toContain('continueFormId={playbookResolved.active ? "contentForm" : null}')
		expect(location).toContain('continueFormId={playbook.active ? "locationForm" : null}')
		expect(subtype).toContain('continueFormId={playbook.active ? "subtypeForm" : null}')
		expect(images).toContain('playbook.active ? "hidden"')
	})

	it("keeps canonical preparation on tickets instead of dropping to the workspace", () => {
		const resolved = resolvePlaybookFromUrl(
			new URL(
				"http://localhost/product/p1/tickets?playbook=launch-tour&step=tickets&flow=create&tourFlowVersion=2"
			)
		)
		expect(resolved).toMatchObject({
			active: true,
			playbookId: "launch-tour",
			stepId: "tickets",
			productId: "p1",
		})
		expect(
			resolveCompleteToPublishPlaybookFromUrl(
				new URL("http://localhost/product/p1/tickets?playbook=complete-to-publish&flow=complete")
			).stepId
		).toBe("tickets")
	})

	it("binds async editor steps to the playbook footer instead of inline continue", () => {
		const tickets = read("src/pages/product/[id]/tickets.astro")
		const departures = read("src/pages/product/[id]/departures/new.astro")
		expect(tickets).toContain('continueFormId={playbook.active ? "ticketsPlaybookForm" : null}')
		expect(tickets).not.toContain("save-and-continue-btn")
		expect(departures).toContain(
			'continueFormId={playbook.active ? "tour-slot-profile-form" : null}'
		)
		expect(departures).toContain("playbookFooterControls={playbook.active}")
		expect(tickets).toContain("resolvePlaybookFromUrl")
		expect(departures).toContain("resolvePlaybookFromUrl")
	})

	it("continues legacy preparation while publication corrections return to review", () => {
		const continueData = new FormData()
		continueData.set("playbook", "complete-to-publish")
		continueData.set("flow", "complete")
		continueData.set("playbookCurrentStep", "photos")
		continueData.set("playbookVertical", "tour")
		expect(
			resolvePlaybookRedirectAfterSave(continueData, {
				productId: "p1",
				launchPath: "/product/p1/subtype",
				launchStep: "subtype",
				intent: "continue",
			})
		).toBe("/product/p1/tickets?playbook=launch-tour&step=tickets&flow=create&tourFlowVersion=2")

		continueData.set("playbookCurrentStep", "content")
		expect(
			resolvePlaybookRedirectAfterSave(continueData, {
				productId: "p1",
				launchPath: "/product/p1/categories",
				launchStep: "categories",
				intent: "continue",
			})
		).toBe("/product/p1/subtype?playbook=launch-tour&step=subtype&flow=create&tourFlowVersion=2")

		continueData.set("tourFlowVersion", "2")
		const publication = new URL(
			resolvePlaybookRedirectAfterSave(continueData, {
				productId: "p1",
				launchPath: "/product/p1/categories",
				launchStep: "categories",
				intent: "continue",
			}),
			"http://fastt.local"
		)
		expect(publication.pathname).toBe("/product/p1/preview")
		expect(publication.searchParams.get("playbook")).toBe("complete-to-publish")

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
