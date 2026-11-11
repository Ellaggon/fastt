import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Fields from "@/components/admin/cases/CoverageReviewFields.astro"

it("renders insurance review as ordinary labelled fields, not a JSON editor", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Fields, { props: { kind: "insurance" } })
	expect(html).toContain('name="coverage.sufficiencyRationale"')
	expect(html).toContain('name="coverage.nextReview"')
	expect(html).not.toContain("coverage.itineraryReference")
})
it("renders route evidence and a repeatable municipality/site group", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Fields, { props: { kind: "route" } })
	expect(html).toContain('name="coverage.places.0.basis"')
	expect(html).toContain('name="coverage.places.0.permitReference"')
	expect(html).toContain("data-add-route-place")
	expect(html).not.toContain('value="pending"')
})
