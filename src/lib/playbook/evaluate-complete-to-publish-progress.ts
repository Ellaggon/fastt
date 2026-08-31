import { POLICY_CATEGORY_ORDER } from "@/data/policy/policy-categories"
import {
	getProductVerticalEntry,
	type ProductVerticalSectionKey,
} from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import { productRepository } from "@/container"
import {
	TOUR_QUALITY_MIN_IMAGES,
	TOUR_QUALITY_MIN_ITINERARY_STEPS,
} from "@/lib/tours/tourAdminQuality"
import { buildCompleteToPublishHref } from "@/lib/playbook/complete-to-publish"
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import {
	essentialHouseRuleTypes,
	houseRuleLabels,
} from "@/modules/house-rules/presentation/houseRulePresentation"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import { loadVariantCompletion } from "@/lib/playbook/evaluate-add-room-progress"

export type CompleteToPublishCheck = {
	key: string
	sectionKey: ProductVerticalSectionKey
	label: string
	guestImpact: string
	complete: boolean
	statusLabel: string
	completedCount?: number
	totalCount?: number
	missingItems?: string[]
	href: string
	cta: string
	detail: string
}

export type CompleteToPublishState = {
	checks: CompleteToPublishCheck[]
	blockers: CompleteToPublishCheck[]
	readyToPublish: boolean
	completedChecks: number
	totalChecks: number
	readinessPercent: number
}

const SECTION_GUEST_IMPACT: Partial<Record<ProductVerticalSectionKey, string>> = {
	content: "Lo que el huésped lee en la ficha",
	photos: "Imágenes que generan confianza al reservar",
	location: "Dónde está y cómo llegar",
	subtype: "Tipo y características visibles de la oferta",
	rooms: "Espacios donde descansará el huésped",
	houseRules: "Qué esperar durante la estadía",
	bookingPolicies: "Cancelación, pago y reglas de reserva",
	itinerary: "Secuencia de actividades del tour",
	tickets: "Modalidades que puede seleccionar el viajero",
	departure: "La primera salida reservable del tour",
	rate: "El precio de venta de la salida",
	calendar: "El cupo disponible para reservar",
	inclusions: "Qué incluye y qué no incluye el paquete",
	preview: "Revisión final antes de recibir reservas",
}

const BLOCKER_ORDER: ProductVerticalSectionKey[] = [
	"content",
	"photos",
	"location",
	"subtype",
	"rooms",
	"itinerary",
	"tickets",
	"departure",
	"rate",
	"calendar",
	"inclusions",
	"houseRules",
	"bookingPolicies",
	"preview",
]

function sectionHref(productId: string, section: ProductVerticalSectionKey): string {
	switch (section) {
		case "content":
			return `/product/${encodeURIComponent(productId)}/content`
		case "photos":
			return `/product/${encodeURIComponent(productId)}/images`
		case "location":
			return `/product/${encodeURIComponent(productId)}/location`
		case "subtype":
		case "itinerary":
		case "inclusions":
			return `/product/${encodeURIComponent(productId)}/subtype`
		case "tickets":
			return `/product/${encodeURIComponent(productId)}/tickets`
		case "departure":
			return `/product/${encodeURIComponent(productId)}/departures/new`
		case "rate":
			return `${routes.rates()}?productId=${encodeURIComponent(productId)}&openDialog=1`
		case "calendar":
			return `${routes.calendar()}?focus=availability`
		case "rooms":
			return routes.productRoomsForProduct(productId)
		case "houseRules":
			return `${routes.providerHouseRules()}?productId=${encodeURIComponent(productId)}`
		case "bookingPolicies":
			return routes.rates()
		case "preview":
			return routes.productPreview(productId)
		default:
			return routes.productDetail(productId)
	}
}

function sectionLabel(section: ProductVerticalSectionKey, verticalLabel: string): string {
	const labels: Record<ProductVerticalSectionKey, string> = {
		identity: "Identidad de la oferta",
		content: "Contenido visible para huéspedes",
		photos: "Fotos",
		location: "Ubicación",
		subtype: `Detalles del ${verticalLabel}`,
		rooms: "Habitaciones",
		houseRules: "Reglas para huéspedes",
		bookingPolicies: "Condiciones de reserva",
		itinerary: "Itinerario del tour",
		tickets: "Modalidades y tickets",
		departure: "Primera salida",
		rate: "Precio de la salida",
		calendar: "Cupo y disponibilidad",
		inclusions: "Incluye / No incluye",
		services: "Servicios incluidos",
		preview: "Vista previa y publicar",
	}
	return labels[section] ?? section
}

function sectionCta(section: ProductVerticalSectionKey): string {
	const ctas: Partial<Record<ProductVerticalSectionKey, string>> = {
		content: "Editar contenido",
		photos: "Editar fotos",
		location: "Editar ubicación",
		subtype: "Editar detalles",
		rooms: "Ver habitaciones",
		houseRules: "Revisar reglas",
		bookingPolicies: "Revisar tarifas",
		itinerary: "Editar itinerario",
		tickets: "Configurar tickets",
		departure: "Crear salida",
		rate: "Configurar precio",
		calendar: "Configurar disponibilidad",
		inclusions: "Editar inclusiones",
		preview: "Ir a vista previa",
	}
	return ctas[section] ?? "Completar"
}

export async function loadCompleteToPublishState(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
}): Promise<CompleteToPublishState | null> {
	const { productId, providerId } = params
	const aggregate = await getProductFullAggregate(productId, providerId)
	if (!aggregate) return null

	const vertical = getProductVerticalEntry(aggregate.productType)
	const verticalLabel = vertical.labels.singular.toLowerCase()
	const isHotel = vertical.vertical === "hotel"
	const repositoryAggregate = await productRepository.getProductAggregate(productId)
	const tourReadiness =
		repositoryAggregate?.verticalReadiness?.kind === "tour"
			? repositoryAggregate.verticalReadiness.tour
			: null
	const description = String(aggregate.content.description ?? "").trim()
	const highlights = Array.isArray(aggregate.content.highlights) ? aggregate.content.highlights : []
	const packageIncludes =
		aggregate.subtype?.kind === "package" ? String(aggregate.subtype.includes ?? "").trim() : ""
	const packageInclusionItems = packageIncludes
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean)
	const tourSubtype = aggregate.subtype?.kind === "tour" ? aggregate.subtype : null
	const tourItinerarySteps = Array.isArray(tourSubtype?.itinerary)
		? tourSubtype.itinerary.filter(Boolean).length
		: 0

	const guestExpectationsSnapshot = isHotel
		? await buildGuestStayExpectationsSnapshot(productId)
		: null
	const houseRules = guestExpectationsSnapshot?.rules ?? []
	const houseRuleTypeSet = new Set(
		houseRules.map((rule: { type?: string }) => String(rule.type ?? ""))
	)
	const missingHouseRules = isHotel
		? essentialHouseRuleTypes.filter((type) => !houseRuleTypeSet.has(type))
		: []

	let variantsCount = 0
	let sellableRoomCount = 0
	if (isHotel) {
		const variantsAggregate = await getProductVariantsAggregate(productId, providerId)
		const activeRoomIds = (variantsAggregate?.variants ?? [])
			.filter((variant) => String(variant.lifecycleState ?? "") !== "archived")
			.map((variant) => String(variant.id ?? "").trim())
			.filter(Boolean)
		variantsCount = activeRoomIds.length
		const completions = await Promise.all(
			activeRoomIds.map((variantId) => loadVariantCompletion(productId, providerId, variantId))
		)
		sellableRoomCount = completions.filter((completion) => completion?.sellable).length
	}

	const requiredPolicyCategories = ["Cancellation", "Payment", "CheckIn", "NoShow"]
	let missingPolicies: string[] = []
	let policyResolutionError: string | null = null
	try {
		const resolvedPolicies = await resolveEffectivePolicies({
			productId,
			channel: "web",
			requiredCategories: requiredPolicyCategories,
			onMissingCategory: "return_null",
			featureContext: params.request
				? {
						request: params.request,
						query: params.url?.searchParams ?? new URLSearchParams(),
					}
				: undefined,
		})
		const policyCategorySet = new Set(
			resolvedPolicies.policies.map((policy) => String(policy.category ?? ""))
		)
		missingPolicies =
			resolvedPolicies.missingCategories.length > 0
				? resolvedPolicies.missingCategories
				: requiredPolicyCategories.filter((category) => !policyCategorySet.has(category))
	} catch (error) {
		policyResolutionError =
			error instanceof Error ? error.message : "No se pudieron resolver las condiciones"
	}

	const completionBySection: Partial<
		Record<
			ProductVerticalSectionKey,
			{
				complete: boolean
				detail: string
				statusLabel?: string
				completedCount?: number
				totalCount?: number
				missingItems?: string[]
			}
		>
	> = {
		identity: { complete: true, detail: "Nombre y tipo configurados.", statusLabel: "Configurada" },
		content: {
			complete: Boolean(description && highlights.length),
			statusLabel: description && highlights.length ? "Visible" : "Falta contenido",
			detail:
				description && highlights.length
					? "Descripción y destacados listos."
					: "Agrega descripción y al menos un destacado.",
		},
		photos: {
			complete:
				vertical.vertical === "tour"
					? aggregate.images.length >= TOUR_QUALITY_MIN_IMAGES
					: aggregate.images.length > 0,
			detail: aggregate.images.length
				? vertical.vertical === "tour" && aggregate.images.length < TOUR_QUALITY_MIN_IMAGES
					? `Agrega ${TOUR_QUALITY_MIN_IMAGES - aggregate.images.length} fotos más para publicar.`
					: `${aggregate.images.length} fotos disponibles.`
				: vertical.vertical === "tour"
					? `Agrega al menos ${TOUR_QUALITY_MIN_IMAGES} fotos.`
					: "Agrega al menos una foto.",
			statusLabel: aggregate.images.length
				? `${aggregate.images.length} foto${aggregate.images.length === 1 ? "" : "s"}`
				: "Sin fotos",
		},
		location: {
			complete: aggregate.location.lat !== null && aggregate.location.lng !== null,
			statusLabel:
				aggregate.location.lat !== null && aggregate.location.lng !== null
					? "Ubicación definida"
					: "Sin ubicación",
			detail:
				aggregate.location.lat !== null && aggregate.location.lng !== null
					? "Coordenadas configuradas."
					: "Agrega coordenadas antes de publicar.",
		},
		subtype: {
			complete:
				vertical.vertical === "tour"
					? Boolean(
							tourSubtype &&
							Number(tourSubtype.durationMinutes ?? 0) > 0 &&
							tourSubtype.meetingPoint &&
							Array.isArray(tourSubtype.includes) &&
							tourSubtype.includes.length > 0
						)
					: Boolean(aggregate.subtype),
			detail:
				vertical.vertical === "tour"
					? "Define duración, punto de encuentro e inclusiones."
					: aggregate.subtype
						? "Detalles del subtipo configurados."
						: "Completa los detalles.",
			statusLabel:
				vertical.vertical === "tour"
					? "Detalles del tour"
					: aggregate.subtype
						? "Configurado"
						: "Sin configurar",
		},
		rooms: {
			complete: !isHotel || sellableRoomCount > 0,
			completedCount: sellableRoomCount,
			totalCount: Math.max(variantsCount, 1),
			statusLabel: !isHotel
				? "No aplica"
				: sellableRoomCount > 0
					? `${sellableRoomCount} vendible${sellableRoomCount === 1 ? "" : "s"}`
					: variantsCount > 0
						? "Sin habitación vendible"
						: "Sin habitaciones",
			detail: !isHotel
				? "No aplica para este tipo de oferta."
				: variantsCount === 0
					? "Crea al menos una habitación."
					: sellableRoomCount > 0
						? `${sellableRoomCount} habitación${sellableRoomCount === 1 ? "" : "es"} vendible${sellableRoomCount === 1 ? "" : "s"}.`
						: "Completa fotos, tarifa, condiciones y disponibilidad en al menos una habitación.",
		},
		houseRules: {
			complete: !isHotel || missingHouseRules.length === 0,
			completedCount: essentialHouseRuleTypes.length - missingHouseRules.length,
			totalCount: essentialHouseRuleTypes.length,
			missingItems: missingHouseRules.map((type) => houseRuleLabels[type] ?? type),
			statusLabel: !isHotel
				? "No aplica"
				: `${essentialHouseRuleTypes.length - missingHouseRules.length}/${essentialHouseRuleTypes.length} esenciales`,
			detail: !isHotel
				? "No aplica para este tipo de oferta."
				: missingHouseRules.length
					? `Faltan: ${missingHouseRules.map((type) => houseRuleLabels[type] ?? type).join(", ")}.`
					: "Reglas principales listas.",
		},
		bookingPolicies: {
			complete: missingPolicies.length === 0 && !policyResolutionError,
			completedCount: policyResolutionError
				? 0
				: requiredPolicyCategories.length - missingPolicies.length,
			totalCount: requiredPolicyCategories.length,
			missingItems: missingPolicies.map(
				(category) =>
					POLICY_CATEGORY_ORDER[category as keyof typeof POLICY_CATEGORY_ORDER] ?? category
			),
			statusLabel: policyResolutionError
				? "Sin verificar"
				: `${requiredPolicyCategories.length - missingPolicies.length}/${requiredPolicyCategories.length} condiciones`,
			detail: policyResolutionError
				? "No se pudieron resolver las condiciones."
				: missingPolicies.length
					? `Faltan: ${missingPolicies.map((category) => POLICY_CATEGORY_ORDER[category as keyof typeof POLICY_CATEGORY_ORDER] ?? category).join(", ")}.`
					: "Condiciones principales visibles.",
		},
		itinerary: {
			complete: tourItinerarySteps >= TOUR_QUALITY_MIN_ITINERARY_STEPS,
			statusLabel: `${tourItinerarySteps}/${TOUR_QUALITY_MIN_ITINERARY_STEPS} pasos`,
			detail: `Completa al menos ${TOUR_QUALITY_MIN_ITINERARY_STEPS} pasos del itinerario.`,
		},
		tickets: {
			complete:
				vertical.vertical !== "tour" ||
				(Boolean(tourReadiness?.hasActiveTickets) && Boolean(tourReadiness?.hasCategory)),
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: tourReadiness?.hasActiveTickets && tourReadiness?.hasCategory
						? "Hay una modalidad activa y una categoría de discovery."
						: "Crea una modalidad activa y asigna una categoría de discovery.",
			statusLabel: tourReadiness?.hasActiveTickets ? "Modalidad activa" : "Sin modalidad",
		},
		departure: {
			complete: vertical.vertical !== "tour" || Number(tourReadiness?.activeSlotCount ?? 0) > 0,
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: Number(tourReadiness?.activeSlotCount ?? 0) > 0
						? "Hay una salida activa."
						: "Crea una salida activa con fecha, hora y cupo.",
			statusLabel: Number(tourReadiness?.activeSlotCount ?? 0) > 0 ? "Salida activa" : "Sin salida",
		},
		rate: {
			complete: vertical.vertical !== "tour" || Number(tourReadiness?.completeSlotCount ?? 0) > 0,
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: Number(tourReadiness?.completeSlotCount ?? 0) > 0
						? "La salida tiene tarifa activa."
						: "Asigna una tarifa activa a la salida.",
			statusLabel:
				Number(tourReadiness?.completeSlotCount ?? 0) > 0 ? "Tarifa activa" : "Sin tarifa",
		},
		calendar: {
			complete: vertical.vertical !== "tour" || Number(tourReadiness?.completeSlotCount ?? 0) > 0,
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: Number(tourReadiness?.completeSlotCount ?? 0) > 0
						? "La salida tiene cupo y disponibilidad."
						: "Configura cupo y disponibilidad de la salida.",
			statusLabel: Number(tourReadiness?.completeSlotCount ?? 0) > 0 ? "Cupo definido" : "Sin cupo",
		},
		inclusions: {
			complete: packageInclusionItems.length > 0,
			statusLabel: packageInclusionItems.length
				? `${packageInclusionItems.length} incluidas`
				: "Sin inclusiones",
			detail: packageInclusionItems.length
				? `${packageInclusionItems.length} inclusiones visibles.`
				: "Agrega qué incluye el paquete antes de publicar.",
		},
		preview: {
			complete: false,
			detail: "Revisa la ficha y publica cuando todo esté listo.",
			statusLabel: "Pendiente de revisión",
		},
	}

	const requiredSections = vertical.readiness.requiredSections.filter(
		(section) => section !== "identity"
	)

	const checks: CompleteToPublishCheck[] = requiredSections.map((section) => {
		const completion = completionBySection[section] ?? {
			complete: false,
			detail: "Pendiente de completar.",
			statusLabel: "Pendiente",
		}
		return {
			key: section,
			sectionKey: section,
			label: sectionLabel(section, verticalLabel),
			guestImpact: SECTION_GUEST_IMPACT[section] ?? "Información visible para el huésped",
			complete: completion.complete,
			statusLabel: completion.statusLabel ?? (completion.complete ? "Configurado" : "Pendiente"),
			completedCount: completion.completedCount,
			totalCount: completion.totalCount,
			missingItems: completion.missingItems,
			href: sectionHref(productId, section),
			cta: sectionCta(section),
			detail: completion.detail,
		}
	})

	const actionableChecks = checks.filter((check) => check.sectionKey !== "preview")
	const allActionableComplete = actionableChecks.every((check) => check.complete)
	const previewCheck = checks.find((check) => check.sectionKey === "preview")
	if (previewCheck) {
		previewCheck.complete = allActionableComplete
		previewCheck.detail = allActionableComplete
			? "Todo listo. Publica para recibir reservas."
			: "Completa los pasos pendientes antes de publicar."
		previewCheck.statusLabel = allActionableComplete
			? "Lista para publicar"
			: "Pendiente de revisión"
	}

	const blockers = checks
		.filter((check) => !check.complete)
		.sort((a, b) => BLOCKER_ORDER.indexOf(a.sectionKey) - BLOCKER_ORDER.indexOf(b.sectionKey))

	const completedChecks = checks.filter((check) => check.complete).length
	const totalChecks = checks.length

	return {
		checks,
		blockers,
		readyToPublish: allActionableComplete,
		completedChecks,
		totalChecks,
		readinessPercent: totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0,
	}
}

export type CompleteToPublishProgressStep = {
	key: ProductVerticalSectionKey
	label: string
	guestImpact: string
	complete: boolean
	href: string
	isCurrent: boolean
	isNext: boolean
	isBlocker: boolean
}

export type CompleteToPublishProgressResult = {
	playbookId: "complete-to-publish"
	productId: string
	progress: {
		completedSteps: number
		totalSteps: number
		progressPercent: number
	}
	steps: CompleteToPublishProgressStep[]
	blockers: CompleteToPublishProgressStep[]
	currentStep: ProductVerticalSectionKey | null
	nextStep: ProductVerticalSectionKey | null
	nextHref: string | null
	readyToPublish: boolean
	exitHref: string
}

export async function evaluateCompleteToPublishProgress(
	productId: string,
	providerId: string,
	options: {
		currentStepId?: ProductVerticalSectionKey | string | null
		request?: Request
		url?: URL
	} = {}
): Promise<CompleteToPublishProgressResult | null> {
	const state = await loadCompleteToPublishState({
		productId,
		providerId,
		request: options.request,
		url: options.url,
	})
	if (!state) return null

	// Keep the stable readiness order in the shell. Moving blockers to the front made a
	// partially prepared accommodation look like it had returned to "Paso 1 de N".
	const orderedSteps = state.checks

	const explicitStep = String(options.currentStepId ?? "").trim() as ProductVerticalSectionKey
	const currentStepId =
		explicitStep ||
		state.blockers[0]?.sectionKey ||
		(state.readyToPublish ? "preview" : orderedSteps[0]?.sectionKey) ||
		null
	const nextBlocker = state.blockers.find((check) => check.sectionKey !== currentStepId)

	const steps: CompleteToPublishProgressStep[] = orderedSteps.map((check) => ({
		key: check.sectionKey,
		label: check.label,
		guestImpact: check.guestImpact,
		complete: check.complete,
		href: check.href,
		isCurrent: check.sectionKey === currentStepId,
		isNext: check.sectionKey === nextBlocker?.sectionKey,
		isBlocker: !check.complete,
	}))

	return {
		playbookId: "complete-to-publish",
		productId,
		progress: {
			completedSteps: state.completedChecks,
			totalSteps: state.totalChecks,
			progressPercent: state.readinessPercent,
		},
		steps,
		blockers: steps.filter((step) => step.isBlocker),
		currentStep: currentStepId,
		nextStep: nextBlocker?.sectionKey ?? null,
		nextHref: nextBlocker
			? buildCompleteToPublishHref(nextBlocker.href, nextBlocker.sectionKey)
			: state.readyToPublish
				? buildCompleteToPublishHref(routes.productPreview(productId), "preview")
				: null,
		readyToPublish: state.readyToPublish,
		exitHref: routes.productDetail(productId),
	}
}
