import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Progress from "@/components/tours/TourPreparationProgress.astro"

describe("shared accessible tour preparation", () => {
	it.each([0, 90, 100])(
		"uses the same %s percent for text, width and accessibility",
		async (percent) => {
			const container = await AstroContainer.create()
			const html = await container.renderToString(Progress, {
				props: {
					preparation: { readyCount: percent / 10, totalCount: 10, readinessPercent: percent },
				},
			})
			expect(html).toContain(`Preparado ${percent}%`)
			expect(html).toContain(`Requisitos ${percent / 10} de 10`)
			expect(html).toContain(`aria-valuenow="${percent}"`)
			expect(html).toContain(`width: ${percent}%`)
		}
	)
	it("renders current stage separately from its readiness without a second preview meter", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Progress, {
			props: {
				preparation: { readyCount: 9, totalCount: 10, readinessPercent: 90 },
				showMeter: false,
				activeStageId: "review",
				stages: [
					{
						id: "review",
						label: "Revisar y publicar",
						position: 6,
						total: 6,
						state: "pending",
						href: null,
					},
				],
			},
		})
		expect(html).toContain('aria-current="step"')
		expect(html).toContain("En curso")
		expect(html).toContain("tour-stage-rail__step--active")
		expect(html).not.toContain('role="progressbar"')
	})
	it("renders stages as one horizontal rail", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Progress, {
			props: {
				preparation: { readyCount: 3, totalCount: 10, readinessPercent: 30 },
				activeStageId: "photos",
				stagePresentation: "list",
				stages: [
					{
						id: "presentation",
						label: "Presenta tu experiencia",
						position: 1,
						total: 6,
						state: "pending",
						href: "/product/t/content",
					},
					{
						id: "photos",
						label: "Fotos",
						position: 3,
						total: 6,
						state: "pending",
						href: null,
					},
				],
			},
		})
		expect(html).toContain('class="tour-stage-list')
		expect(html).not.toContain("grid-cols-3")
		expect(html).toContain('data-tour-stage-id="photos"')
	})
})
