import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Fields from "@/components/tours/ExperienceMeetingFields.astro"
it.each(["guided_tour", "workshop", "class", "tasting", null])(
	"renders one location form for %s",
	async (format) => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Fields, {
			props: {
				format,
				address: "Lugar guardado",
				instructions: "Entrada lateral",
			},
		})
		expect(html.match(/name="meetingPointAddress"/g)).toHaveLength(1)
		expect(html).toContain("Lugar guardado")
		expect(html).toContain("Entrada lateral")
		expect(html).toContain(
			format === "guided_tour" ? "Punto de encuentro" : "Lugar de la experiencia"
		)
	}
)
