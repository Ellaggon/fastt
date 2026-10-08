import { describe, expect, it } from "vitest"
import { presentTourOption, summarizeTourOptions } from "@/lib/tours/tourOptionsWorkspace"
import { readTourRequestData } from "@/lib/tours/tourRequestReads"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"
const profile = {
	id: "option",
	name: "Mañana",
	departureTime: "09:00",
	maxPax: 8,
	languageCode: "es",
	bookingMode: "shared",
	profileActive: true,
}
function row(diagnosis = tourDiagnosticFixture(), published = true) {
	return presentTourOption({
		productId: "tour",
		published,
		profile,
		rates: [{ id: "rate", name: "Estándar", diagnosis }],
	})
}
describe("Options summarize authoritative commercial decisions", () => {
	it("separates a complete draft from an operational published option", () => {
		expect(row().state).toBe("available")
		expect(row(undefined, false).state).toBe("draft")
	})
	it("private requests do not inherit a shared availability warning", () => {
		const diagnosis = tourDiagnosticFixture()
		if (diagnosis.context.selection.state === "resolved")
			diagnosis.context.selection.bookingMode = "private"
		diagnosis.requirements.current_availability.result = {
			state: "pending",
			responsible: "provider",
			reason: { code: "sold_out", message: "Agotado" },
			action: { label: "Calendario", href: "/rates/calendar?variantId=option" },
		}
		const option = presentTourOption({
			productId: "tour",
			published: true,
			profile: { ...profile, bookingMode: "private" },
			rates: [{ id: "rate", name: "Privada", diagnosis }],
		})
		expect(option.state).toBe("requests")
	})
	it("distinguishes exhausted dates and keeps option in its action", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.current_availability.result = {
			state: "pending",
			responsible: "provider",
			reason: { code: "sold_out", message: "Sin cupo" },
			action: { label: "Calendario", href: "/rates/calendar?variantId=option" },
		}
		const option = row(diagnosis)
		expect(option.state).toBe("sold_out")
		expect(new URL(option.primary.href, "https://test").searchParams.get("variantId")).toBe(
			"option"
		)
	})
	it("keeps an incompatible tariff pending while another tariff can operate", () => {
		const incompatible = tourDiagnosticFixture()
		incompatible.requirements.conditions.result = {
			state: "blocked",
			responsible: "provider",
			reason: { code: "incompatible", message: "Política hotelera" },
			action: { label: "Reparar", href: "/rates/plans/bad?variantId=option&ratePlanId=bad" },
		}
		const option = presentTourOption({
			productId: "tour",
			published: true,
			profile,
			rates: [
				{ id: "bad", name: "Histórica", diagnosis: incompatible },
				{ id: "rate", name: "Válida", diagnosis: tourDiagnosticFixture() },
			],
		})
		expect(option.label).toBe("Disponible con tarifas válidas")
		expect(option.rates[0].issue).toBe(true)
		expect(option.rates[0].action.href).toContain("ratePlanId=bad")
		expect(summarizeTourOptions([option])).toMatchObject({ total: 1, available: 1, attention: 0 })
	})
	it("a common block does not borrow the first tariff's different pending action", () => {
		const first = tourDiagnosticFixture()
		const second = tourDiagnosticFixture()
		first.requirements.price.result = {
			state: "pending",
			responsible: "provider",
			reason: { code: "price", message: "Falta precio" },
			action: { label: "Precio", href: "/rates/plans/first?vista=price" },
		}
		for (const diagnosis of [first, second])
			diagnosis.requirements.provider_authorization.result = {
				state: "blocked",
				responsible: "provider",
				reason: { code: "authorization", message: "Falta identidad" },
				action: {
					label: "Revisar identidad",
					href: "/provider/settings/verification?line=tour&tab=identity",
				},
			}
		const option = presentTourOption({
			productId: "tour",
			published: true,
			profile,
			rates: [
				{ id: "first", name: "Primera", diagnosis: first },
				{ id: "second", name: "Segunda", diagnosis: second },
			],
		})
		expect(option.label).toBe("Habilitación pendiente")
		expect(option.primary.href).toContain("tab=identity")
		expect(option.detail).toBe("Falta identidad")
	})

	it("an editorial pending task does not claim that an already active option needs activation", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.presentation.result = {
			state: "pending",
			responsible: "provider",
			reason: { code: "presentation", message: "Completa presentación" },
			action: { label: "Editar presentación", href: "/product/tour/presentation" },
		}
		expect(row(diagnosis).label).toBe("Preparación del tour pendiente")
	})

	it("failed evaluation is not empty or ready", () => {
		const option = presentTourOption({
			productId: "tour",
			published: true,
			profile,
			rates: [{ id: "rate", name: "Tarifa", diagnosis: null }],
		})
		expect(option.state).toBe("unknown")
	})
	it("no tariff offers configuration without fabricating a default", () => {
		const option = presentTourOption({ productId: "tour", published: true, profile, rates: [] })
		expect(option.label).toBe("Precio pendiente")
		expect(option.primary.href).not.toContain("ratePlanId=")
	})
	it("shares GET reads only within the same request, not commands", async () => {
		let reads = 0
		const load = async () => ++reads
		const request = new Request("https://test")
		expect(
			await Promise.all([
				readTourRequestData(request, "key", load),
				readTourRequestData(request, "key", load),
			])
		).toEqual([1, 1])
		await readTourRequestData(new Request("https://test"), "key", load)
		const command = new Request("https://test", { method: "POST" })
		await readTourRequestData(command, "key", load)
		await readTourRequestData(command, "key", load)
		expect(reads).toBe(4)
	})
})
