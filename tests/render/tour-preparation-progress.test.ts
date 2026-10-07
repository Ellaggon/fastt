import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Progress from "@/components/tours/TourPreparationProgress.astro"
import Review from "@/components/tours/TourReviewStatus.astro"
import { tourDiagnosticFixture as fixture } from "../test-support/tour-diagnostic-fixture"
import { projectTourPublishingStages } from "@/lib/playbook/tour-publishing-stages"

const pending = {
	state: "pending",
	reason: { code: "activation_required", message: "Activa la oferta" },
	responsible: "provider",
	action: { label: "Activar", href: "/product/tour/preview" },
} as const
const reviewHref = "/product/tour/preview?variantId=option&ratePlanId=rate"

describe("tour preparation and review rendered contract", () => {
	it("renders nine stable stages with current location independent from readiness", async () => {
		const diagnosis = fixture()
		diagnosis.requirements.photos.result = {
			...pending,
			state: "not_evaluable",
			reason: { code: "read_failed", message: "Consulta fallida" },
		}
		const container = await AstroContainer.create()
		const html = await container.renderToString(Progress, {
			props: {
				stages: projectTourPublishingStages(diagnosis),
				activeStageId: "photos",
				stagePosition: 3,
				stageTotal: 9,
			},
		})
		expect(html).toContain("Etapa 3 de 9")
		const withProduct = await container.renderToString(Progress, {
			props: {
				stages: projectTourPublishingStages(diagnosis),
				activeStageId: "photos",
				stagePosition: 1,
				stageTotal: 9,
				productName: "Paseo por el parque",
			},
		})
		expect(withProduct).toContain("Paseo por el parque - Etapa 1 de 9")
		expect(html.match(/data-tour-stage-id=/g)).toHaveLength(9)
		expect(html).toContain('aria-current="step"')
		expect(html).toContain("Etapa actual")
		expect(html).toContain("No se pudo comprobar")
		expect(html).not.toContain("Revisar y publicar")
		expect(html).not.toContain("90%")
		expect(html).not.toContain("<progress")
		expect(html).toContain("lg:grid-cols-3")
	})
	it("shows only pending tasks and folds completed requirements without stages", async () => {
		const diagnosis = fixture()
		diagnosis.requirements.photos.result = {
			...pending,
			reason: { code: "photos_missing", message: "Agrega cinco fotos" },
			action: { label: "Fotos", href: "/product/tour/images?step=photos" },
		}
		const container = await AstroContainer.create()
		const html = await container.renderToString(Review, {
			props: { diagnosis, reviewHref, published: false },
		})
		expect(html).toContain("1 tarea pendiente")
		expect(html).toContain("Requisitos cumplidos (9)")
		expect(html).not.toContain("Ver etapas")
		expect(html).not.toMatch(/<details[^>]*open/)
		expect(html).toContain("tourFlowVersion=2")
		expect(html).toContain("returnTo=")
		expect(html).not.toMatch(/<button[^>]*data-tour-review-activate/)
	})
	it("offers explicit activation after preparation, separately from publication", async () => {
		const diagnosis = fixture()
		diagnosis.requirements.option_activation.result = pending
		diagnosis.requirements.rate_activation.result = pending
		const container = await AstroContainer.create()
		const html = await container.renderToString(Review, {
			props: { diagnosis, reviewHref, published: false },
		})
		expect(html).toContain("Activar oferta")
		expect(html).toContain('data-variant-id="option"')
		expect(html).toContain('data-rate-plan-id="rate"')
		diagnosis.requirements.provider_authorization.result = {
			...pending,
			state: "blocked",
			responsible: "fastt",
			reason: { code: "in_review", message: "Revisión pendiente" },
		}
		const blocked = await container.renderToString(Review, {
			props: { diagnosis, reviewHref, published: false },
		})
		expect(blocked).not.toMatch(/<button[^>]*data-tour-review-activate/)
		expect(blocked).toContain("En revisión por Fastt")
	})
	it("does not imply that private requests or publication are enabled by inventory exemption", async () => {
		const diagnosis = fixture()
		if (diagnosis.context.selection.state === "resolved")
			diagnosis.context.selection.bookingMode = "private"
		diagnosis.requirements.current_availability.result = {
			state: "not_applicable",
			reason: { code: "private_mode", message: "No usa cupos compartidos" },
			applicabilityReference: "private_request_contract",
		}
		const container = await AstroContainer.create()
		const html = await container.renderToString(Review, {
			props: { diagnosis, reviewHref, published: false },
		})
		expect(html).not.toContain("Disponibilidad actual")
		expect(html).not.toContain("Oferta publicada")
		expect(html).not.toContain("Solicitudes privadas habilitadas")
	})
})

it("marks a grouped stage pending without surfacing requirement copy in stage boxes", async () => {
	const diagnosis = fixture()
	diagnosis.requirements.activities.result = {
		...pending,
		reason: {
			code: "categories_missing",
			message: "Selecciona al menos una categoría de búsqueda.",
		},
		action: { label: "Elegir categorías", href: "/product/tour/categories?step=categories" },
	}
	const container = await AstroContainer.create()
	const progress = await container.renderToString(Progress, {
		props: { stages: projectTourPublishingStages(diagnosis) },
	})
	expect(progress).toContain('data-tour-stage-id="presentation" data-tour-stage-state="pending"')
	expect(progress).not.toContain("Selecciona al menos una categoría de búsqueda.")
	const review = await container.renderToString(Review, {
		props: { diagnosis, reviewHref, published: false },
	})
	expect(review).toContain("1 tarea pendiente")
	expect(review).not.toContain("Categorías de búsqueda")
	expect(review).toContain("/product/tour/presentation?")
	expect(review).toContain("Requisitos cumplidos (9)")
	expect(review).toContain("Presentación")
})
