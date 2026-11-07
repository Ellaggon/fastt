import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

it("keeps full publication diagnosis on review while allowing focused editors to skip it", () => {
	const layout = source("src/layouts/PlaybookLayout.astro")
	expect(layout).toContain('productId && (stepId === "preview" || !hidePublicationCorrections)')
	for (const page of ["presentation", "subtype", "location", "images", "tickets"])
		expect(source(`src/pages/product/[id]/${page}.astro`)).toContain("hidePublicationCorrections")
	expect(source("src/pages/product/[id]/departures/[slotId]/index.astro")).toContain(
		"hidePublicationCorrections: true"
	)
	expect(source("src/pages/rates/plans/[ratePlanId].astro")).toContain(
		"hidePublicationCorrections={isTourContext}"
	)
})

it("starts authorization before independent readiness reads and still awaits its result", () => {
	const evaluator = source("src/lib/playbook/evaluate-complete-to-publish-progress.ts")
	expect(evaluator.indexOf("const authorizationPromise =")).toBeLessThan(
		evaluator.indexOf("const tourContextPromise =")
	)
	expect(evaluator).toContain("const authorization = await authorizationPromise")
	expect(evaluator).toContain('code: "read_failed"')
})

it("starts rate readiness from validated context without waiting for editorial reads", () => {
	const evaluator = source("src/lib/playbook/evaluate-complete-to-publish-progress.ts")
	expect(evaluator).toContain("const commercialReadinessPromise = tourContextPromise.then")
	expect(evaluator).toContain("repositoryAggregate, tourContext, [commercial, variantReadiness]")
})

it("shares the review aggregate with its request-scoped diagnostic", () => {
	const review = source("src/pages/product/[id]/preview.astro")
	expect(review).toContain("const aggregate = await readTourRequestData(")
	expect(review).toContain("`aggregate:${providerId}:${productId}`")
})
