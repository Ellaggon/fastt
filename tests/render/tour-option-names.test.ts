import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Section from "@/components/tours/TourDepartureSection.astro"
import Editor from "@/components/tours/TourSlotProfileEditor.astro"

const rate = (id: string, name = "Tarifa interna") => ({
	ratePlanId: id,
	ratePlanName: name,
	finalPrice: 100,
	currency: "BOB",
})
async function render(offers: unknown[], slots: Record<string, unknown>) {
	const container = await AstroContainer.create()
	return container.renderToString(Section, {
		props: {
			productId: "tour",
			offers,
			slotsByVariantId: slots,
			searchState: { departureDate: "2026-12-01" },
			previewMode: true,
		},
	})
}
it("keeps a unique alternative separate from its internal rate name", async () => {
	const html = await render([{ variantId: "morning", ratePlans: [rate("rate")] }], {
		morning: { name: "Visita compartida", departureTime: "09:00", bookingMode: "shared" },
	})
	expect(html).toContain("Tu opción del tour")
	expect(html).toContain("Visita compartida")
	expect(html).not.toContain("Tarifa interna")
	expect(html).toContain('data-option-label="Visita compartida"')
	expect(html).toContain('data-option-time="09:00"')
	expect(html).not.toContain("data-tour-booking-root=")
})
it("distinguishes homonymous schedules by time and retains their independent IDs", async () => {
	const html = await render(
		[
			{ variantId: "morning", ratePlans: [rate("rate-am")] },
			{ variantId: "afternoon", ratePlans: [rate("rate-pm")] },
		],
		{
			morning: { name: "Visita compartida", departureTime: "09:00" },
			afternoon: { name: "Visita compartida", departureTime: "14:00" },
		}
	)
	expect(html).toContain("Elige la hora de inicio")
	for (const value of ["09:00", "14:00", "rate-am", "rate-pm"]) expect(html).toContain(value)
})
it("shows distinct alternatives and preserves named rate choices without inventing policies", async () => {
	const html = await render(
		[
			{
				variantId: "shared",
				ratePlans: [rate("flex", "Flexible"), rate("nonref", "No reembolsable")],
			},
			{ variantId: "private", ratePlans: [] },
		],
		{
			shared: { name: "Visita compartida" },
			private: { name: "Visita privada", bookingMode: "private" },
		}
	)
	for (const value of [
		"Elige cómo disfrutar el tour",
		"Flexible",
		"No reembolsable",
		"Visita privada",
	])
		expect(html).toContain(value)
})
it("labels and precargas the existing public name accessibly", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Editor, {
		props: {
			productId: "tour",
			variantId: "option",
			mode: "edit",
			name: "Visita privada",
			departureTime: "09:00",
			maxPax: 12,
			languageCode: "es",
			bookingMode: "private",
		},
	})
	expect(html).toContain("Nombre que verán los viajeros")
	expect(html).toContain('value="Visita privada"')
	expect(html).toContain('aria-describedby="optionNameHelp"')
	expect(html).toContain('id="optionNameHelp"')
})
