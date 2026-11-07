import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("releases saving controls before recording the saved baseline and navigating", () => {
	const source = readFileSync(
		new URL("../../src/components/tours/TourPresentationForm.astro", import.meta.url),
		"utf8"
	)
	const success = source.slice(source.indexOf('status.textContent = "Presentación guardada."'))
	const release = success.indexOf("delete form.dataset.saving")
	const restore = success.indexOf("setPlaybookSubmitBusy(form, false)")
	const baseline = success.indexOf("draft.clear()")
	const navigate = success.indexOf("window.location.assign(result.nextHref)")
	expect(release).toBeGreaterThanOrEqual(0)
	expect(restore).toBeGreaterThan(release)
	expect(baseline).toBeGreaterThan(restore)
	expect(navigate).toBeGreaterThan(baseline)
})
