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
			expect(html).toContain(`${percent}% preparado`)
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
		expect(html).toContain("Pendiente")
		expect(html).not.toContain('role="progressbar"')
	})
})
