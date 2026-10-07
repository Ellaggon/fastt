import { describe, expect, it } from "vitest"
import { projectTourPublicationTasks } from "@/lib/tours/tourPublicationTasks"
import { projectTourPublishingStages } from "@/lib/playbook/tour-publishing-stages"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"
const pending = (href: string, message = "Completa este dato") =>
	({
		state: "pending",
		responsible: "provider",
		reason: { code: "missing", message },
		action: { label: "Completar", href },
	}) as const
describe("publication tasks from saved observations", () => {
	it("recognizes preparation automatically and never adds activation/inventory tasks", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.option_activation.result = pending("/product/tour/preview")
		diagnosis.requirements.current_availability.result = pending("/rates/calendar")
		const view = projectTourPublicationTasks(diagnosis)
		expect(view.tasks).toEqual([])
		expect(view.completed).toHaveLength(10)
	})
	it("groups option profile and capacity into one correction with exact selection", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.option_profile.result = pending(
			"/product/tour/departures/option?step=departure",
			"Falta idioma"
		)
		diagnosis.requirements.group_capacity.result = pending(
			"/product/tour/departures/option?step=departure",
			"Falta capacidad"
		)
		const view = projectTourPublicationTasks(diagnosis)
		expect(view.tasks).toHaveLength(1)
		expect(view.tasks[0].ids).toEqual(["option_profile", "group_capacity"])
		const target = new URL(view.tasks[0].href!, "http://fastt.local")
		expect(target.searchParams.get("variantId")).toBe("option")
		expect(target.searchParams.get("ratePlanId")).toBe("rate")
		expect(target.searchParams.get("tourFlowVersion")).toBe("2")
	})
	it("keeps price and conditions distinct despite their shared route", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.price.result = pending("/rates/plans/rate?vista=price&step=rate")
		diagnosis.requirements.conditions.result = pending(
			"/rates/plans/rate?vista=conditions&step=bookingPolicies"
		)
		expect(projectTourPublicationTasks(diagnosis).tasks).toHaveLength(2)
	})
	it("preserves completed price while requesting only photos", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.photos.result = pending("/product/tour/images?step=photos")
		const view = projectTourPublicationTasks(diagnosis)
		expect(view.tasks.map((task) => task.ids)).toEqual([["photos"]])
		expect(view.completed.find((item) => item.id === "price")).toBeDefined()
	})
	it("keeps Fastt decisions outside provider tasks and unknown reads outside forms", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.experience_authorization.result = {
			...pending("/provider/settings/verification"),
			responsible: "fastt",
		}
		diagnosis.requirements.photos.result = {
			...pending("/product/tour/images"),
			state: "not_evaluable",
		}
		const view = projectTourPublicationTasks(diagnosis)
		expect(view.waiting).toHaveLength(1)
		expect(view.waiting[0].href).toBeNull()
		expect(view.tasks[0].unknown).toBe(true)
		expect(view.tasks[0].href).toBeNull()
	})
})

it("keeps stage completion coherent with individual saved requirements and authorization", () => {
	const diagnosis = tourDiagnosticFixture()
	diagnosis.requirements.activities.result = pending(
		"/product/tour/categories?step=categories",
		"Selecciona al menos una categoría de búsqueda."
	)
	diagnosis.requirements.logistics.result = pending(
		"/product/tour/location?step=location",
		"Agrega coordenadas antes de publicar."
	)
	diagnosis.requirements.calendar_configuration.result = pending(
		"/rates/calendar?step=calendar",
		"Programa al menos una fecha para esta opción."
	)
	diagnosis.requirements.provider_authorization.result = pending(
		"/provider/settings/verification",
		"Registro fiscal verificado"
	)
	diagnosis.requirements.experience_authorization.result = {
		...pending(
			"/provider/settings/verification",
			"Fastt debe revisar las políticas comerciales aplicables."
		),
		responsible: "fastt",
	}
	const stages = projectTourPublishingStages(diagnosis)
	expect(stages.map((stage) => stage.state)).toEqual([
		"pending",
		"pending",
		"ready",
		"ready",
		"ready",
		"ready",
		"ready",
		"ready",
		"pending",
	])
	expect(stages[0].pendingReason).toBe(diagnosis.requirements.activities.result.reason.message)
	expect(stages[1].pendingReason).toBe(diagnosis.requirements.logistics.result.reason.message)
	const view = projectTourPublicationTasks(diagnosis)
	expect(view.tasks).toHaveLength(4)
	expect(view.waiting).toHaveLength(1)
	expect(view.completed).toHaveLength(7)
	expect(view.completed.map((item) => item.id)).not.toContain("presentation")
	const options = { previewHref: "/product/tour/preview" }
	expect(presentTourDiagnostic(diagnosis, options).reviewStatusLabel).toBe("Preparación pendiente")
	for (const id of ["activities", "logistics", "calendar_configuration"] as const) {
		diagnosis.requirements[id].result = tourDiagnosticFixture().requirements[id].result
	}
	expect(projectTourPublishingStages(diagnosis).every((stage) => stage.state === "ready")).toBe(
		true
	)
	expect(presentTourDiagnostic(diagnosis, options).reviewStatusLabel).toBe("Habilitación pendiente")
	diagnosis.requirements.provider_authorization.result =
		tourDiagnosticFixture().requirements.provider_authorization.result
	diagnosis.requirements.experience_authorization.result =
		tourDiagnosticFixture().requirements.experience_authorization.result
	diagnosis.requirements.rate_activation.result = pending("/product/tour/preview")
	expect(presentTourDiagnostic(diagnosis, options).reviewStatusLabel).toBe("Activación pendiente")
})

it("keeps a concrete missing-option correction actionable instead of retrying the summary", () => {
	const diagnosis = tourDiagnosticFixture()
	diagnosis.requirements.option_profile.result = {
		state: "not_evaluable",
		responsible: "provider",
		reason: { code: "missing_option", message: "Crea una opción" },
		action: { label: "Crear opción", href: "/product/tour/departures/new" },
	}
	const task = projectTourPublicationTasks(diagnosis).tasks.find((task) =>
		task.ids.includes("option_profile")
	)!
	expect(task.unknown).toBe(false)
	expect(new URL(task.href!, "http://fastt.local").pathname).toBe("/product/tour/departures/new")
})

it("groups content and categories into one presentation correction without false completion", () => {
	const diagnosis = tourDiagnosticFixture()
	diagnosis.requirements.activities.result = pending("/product/tour/categories?step=categories")
	let view = projectTourPublicationTasks(diagnosis)
	expect(
		view.completed.some((item) => item.id === "presentation" || item.id === "activities")
	).toBe(false)
	expect(view.tasks).toHaveLength(1)
	expect(view.tasks[0].label).toBe("Presentación")
	expect(new URL(view.tasks[0].href!, "http://fastt.local").pathname).toBe(
		"/product/tour/presentation"
	)
	diagnosis.requirements.presentation.result = pending("/product/tour/content?step=content")
	view = projectTourPublicationTasks(diagnosis)
	expect(view.tasks).toHaveLength(1)
	expect(view.tasks[0].ids).toEqual(["presentation", "activities"])
})
