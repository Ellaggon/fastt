import { evaluateTourContentReadiness } from "@/lib/tours/tourContentReadiness"
import { readTourRequestData } from "@/lib/tours/tourRequestReads"
import { projectTourLogisticsObservation } from "@/lib/tours/tourPreparationRequirements"
import { getTourLaunchStepById } from "./launch-tour"
import { tourContextSelectionHint } from "@/lib/tours/resolveTourCommercialContext"
import {
	presentTourDiagnostic,
	TOUR_REQUIREMENT_PRESENTATION,
} from "@/lib/tours/tourDiagnosticPresentation"
import {
	buildTourDiagnostic,
	summarizeTourDiagnostic,
	tourPublicationBlockers,
} from "@/lib/tours/buildTourDiagnostic"
import { type TourDiagnostic } from "@/lib/tours/tourDiagnosticContract"
import { loadTourAuthorization } from "@/lib/tours/loadTourAuthorization"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import {
	loadTourCommercialContext,
	type LoadedTourContext,
} from "@/lib/tours/loadTourCommercialContext"
import { POLICY_CATEGORY_ORDER } from "@/data/policy/policy-categories"
import {
	getProductVerticalEntry,
	type ProductVerticalSectionKey,
} from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import {
	productRepository,
	variantManagementRepository,
	ratePlanPricingReadRepository,
} from "@/container"
import {
	TOUR_QUALITY_MIN_IMAGES,
	TOUR_QUALITY_MIN_ITINERARY_STEPS,
} from "@/lib/tours/tourAdminQuality"
import {
	buildCompleteToPublishHref,
	completeToPublishStepHref,
	completeToPublishNavigationOrder,
	normalizeCompleteToPublishStep,
} from "@/lib/playbook/complete-to-publish"
import {
	getProductFullAggregate,
	getProductVariantsAggregate,
	evaluateVariantReadiness,
} from "@/modules/catalog/public"
import {
	essentialHouseRuleTypes,
	houseRuleLabels,
} from "@/modules/house-rules/presentation/houseRulePresentation"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import { loadVariantCompletion } from "@/lib/playbook/evaluate-add-room-progress"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"

export type CompleteToPublishCheck = {
	key: string
	sectionKey: ProductVerticalSectionKey
	navigationStep?: ProductVerticalSectionKey
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
	editorialStatus?: string
	checks: CompleteToPublishCheck[]
	tourContext?: LoadedTourContext
	tourDiagnostic?: TourDiagnostic
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
	categories: "Cómo se encuentra la experiencia en el catálogo",
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
	"categories",
	"departure",
	"rate",
	"calendar",
	"inclusions",
	"houseRules",
	"bookingPolicies",
	"preview",
]

function sectionHref(
	productId: string,
	section: ProductVerticalSectionKey,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	return completeToPublishStepHref(productId, section, context)
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
		tickets: "Tipos de participante",
		categories: "Categorías de búsqueda",
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
		tickets: "Configurar participantes",
		categories: "Elegir categorías",
		departure: "Editar salida",
		rate: "Configurar precio",
		calendar: "Configurar disponibilidad",
		inclusions: "Editar inclusiones",
		preview: "Ir a vista previa",
	}
	return ctas[section] ?? "Completar"
}

type CompleteToPublishInput = {
	productId: string
	providerId: string
	request?: Request
	url?: URL
	selection?: { variantId?: string | null; ratePlanId?: string | null }
	session?: { variantId?: string | null; ratePlanId?: string | null }
}
const diagnosisByRequest = new WeakMap<
	Request,
	Map<string, Promise<CompleteToPublishState | null>>
>()

/** A read request observes one snapshot per commercial intent; commands always evaluate afresh. */
export function loadCompleteToPublishState(
	params: CompleteToPublishInput
): Promise<CompleteToPublishState | null> {
	if (!params.request || params.request.method !== "GET")
		return evaluateCompleteToPublishState(params)
	const hint = tourContextSelectionHint(params)
	const explicit = Boolean(hint.variantId?.trim() || hint.ratePlanId?.trim())
	const key = JSON.stringify([
		params.providerId,
		params.productId,
		params.url?.searchParams.get("productId") &&
		params.url.searchParams.get("productId") !== params.productId
			? params.url.searchParams.get("productId")
			: null,
		hint.variantId?.trim() || null,
		hint.ratePlanId?.trim() || null,
		explicit ? null : params.session?.variantId?.trim() || null,
		explicit ? null : params.session?.ratePlanId?.trim() || null,
	])
	let cache = diagnosisByRequest.get(params.request)
	if (!cache) {
		cache = new Map()
		diagnosisByRequest.set(params.request, cache)
	}
	const existing = cache.get(key)
	if (existing) return existing
	const pending = evaluateCompleteToPublishState(params)
	cache.set(key, pending)
	return pending
}

async function evaluateCompleteToPublishState(
	params: CompleteToPublishInput
): Promise<CompleteToPublishState | null> {
	const { productId, providerId } = params
	const aggregate = await readTourRequestData(
		params.request,
		`aggregate:${providerId}:${productId}`,
		() => getProductFullAggregate(productId, providerId)
	)
	if (!aggregate) return null

	const vertical = getProductVerticalEntry(aggregate.productType)
	const verticalLabel = vertical.labels.singular.toLowerCase()
	const isHotel = vertical.vertical === "hotel"
	const repositoryAggregate = await readTourRequestData(
		params.request,
		`repository-aggregate:${providerId}:${productId}`,
		() => productRepository.getProductAggregate(productId)
	)
	const tourReadiness =
		repositoryAggregate?.verticalReadiness?.kind === "tour"
			? repositoryAggregate.verticalReadiness.tour
			: null
	const contentReadiness = evaluateTourContentReadiness(aggregate, tourReadiness)

	const tourContext =
		vertical.vertical === "tour" ? await loadTourCommercialContext(params) : undefined
	if (tourContext?.status === "not_found") return null
	const tourCommercialContext = {
		variantId: tourContext && "variantId" in tourContext ? tourContext.variantId : null,
		ratePlanId: tourContext && "ratePlanId" in tourContext ? tourContext.ratePlanId : null,
	}
	const selectedOption = tourContext?.status === "resolved" ? tourContext.option : null
	const selectedActiveSlotCount =
		selectedOption?.salesEnabled && selectedOption.lifecycleState === "ready" ? 1 : 0
	let commercialReadFailed = false
	const [commercial, variantReadiness] =
		tourContext?.status === "resolved"
			? await Promise.all([
					validateRatePlanPublication({
						productId,
						variantId: tourContext.variantId!,
						ratePlanId: tourContext.ratePlanId!,
						request: params.request,
					}).catch(() => {
						commercialReadFailed = true
						return null
					}),
					evaluateVariantReadiness(
						{
							repo: variantManagementRepository,
							pricingReadRepo: ratePlanPricingReadRepository,
							persist: false,
						},
						{ variantId: tourContext.variantId!, ratePlanId: tourContext.ratePlanId! }
					).catch(() => null),
				])
			: [null, undefined]

	const readinessHas = (code: string) =>
		Boolean(variantReadiness?.validationErrors.some((error) => error.code === code))

	const authorization =
		vertical.vertical === "tour"
			? await readTourRequestData(params.request, `authorization:${providerId}:${productId}`, () =>
					loadTourAuthorization({ productId, providerId })
				).catch(() => {
					return {
						provider_authorization: {
							ready: false,
							message: "No se pudo verificar la cuenta.",
							code: "read_failed",
						},
						experience_authorization: {
							ready: false,
							message: "No se pudo verificar la experiencia.",
							code: "read_failed",
						},
					}
				})
			: null
	const futureAvailableDateCount = commercial?.observations.availableDateCount ?? 0
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

	const requiredPolicyCategories = [...getRequiredPolicyCategories(aggregate.productType)]
	let missingPolicies: string[] = []
	let policyResolutionError: string | null = null
	try {
		if (vertical.vertical === "tour" && tourContext?.status !== "resolved") {
			throw new Error("Selecciona una opción y tarifa para revisar sus condiciones.")
		}
		const resolvedPolicies =
			vertical.vertical === "tour"
				? null
				: await resolveEffectivePolicies({
						productId,
						variantId: tourCommercialContext.variantId ?? undefined,
						ratePlanId: tourCommercialContext.ratePlanId ?? undefined,
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
		if (!resolvedPolicies) {
			missingPolicies = commercial?.observations.conditionsReady ? [] : requiredPolicyCategories
		} else {
			const policyCategorySet = new Set(
				resolvedPolicies.policies.map((policy) => String(policy.category ?? ""))
			)
			missingPolicies =
				resolvedPolicies.missingCategories.length > 0
					? resolvedPolicies.missingCategories
					: requiredPolicyCategories.filter((category) => !policyCategorySet.has(category))
		}
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
			complete: vertical.vertical !== "tour" || Boolean(tourReadiness?.hasActiveTickets),
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: tourReadiness?.hasActiveTickets
						? "Hay al menos un tipo de participante activo."
						: "Crea al menos un tipo de participante activo.",
			statusLabel: tourReadiness?.hasActiveTickets ? "Modalidad activa" : "Sin modalidad",
		},
		categories: {
			complete: vertical.vertical !== "tour" || Boolean(tourReadiness?.hasCategory),
			detail:
				vertical.vertical !== "tour"
					? "No aplica para este tipo de oferta."
					: tourReadiness?.hasCategory
						? "La experiencia tiene una categoría pública de búsqueda."
						: "Selecciona al menos una categoría de búsqueda.",
			statusLabel: tourReadiness?.hasCategory ? "Categoría asignada" : "Sin categoría",
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
	const checks: CompleteToPublishCheck[] =
		vertical.vertical === "tour"
			? []
			: requiredSections.map((section) => {
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
						statusLabel:
							completion.statusLabel ?? (completion.complete ? "Configurado" : "Pendiente"),
						completedCount: completion.completedCount,
						totalCount: completion.totalCount,
						missingItems: completion.missingItems,
						href: sectionHref(productId, section),
						cta: sectionCta(section),
						detail: completion.detail,
					}
				})
	let tourDiagnostic: TourDiagnostic | undefined
	if (tourContext && authorization) {
		const observed = (ready: boolean, message: string) => ({ ready, message })
		const commercialObservation = (ready: boolean, message: string) => ({
			ready,
			message: commercialReadFailed
				? "No se pudo verificar la configuración comercial. Vuelve a intentar."
				: message,
			...(commercialReadFailed ? { code: "read_failed" } : {}),
		})
		tourDiagnostic = buildTourDiagnostic({
			providerId,
			productId,
			context: tourContext,
			timezone: commercial?.observations.timezone ?? "UTC",
			observations: {
				presentation: observed(
					contentReadiness.presentation,
					"Completa nombre, destino, descripción y destacados."
				),
				logistics: {
					...projectTourLogisticsObservation(
						["subtype", "itinerary"].map((sectionKey) => ({
							sectionKey: sectionKey as "subtype" | "itinerary",
							complete: Boolean(
								completionBySection[sectionKey as ProductVerticalSectionKey]?.complete
							),
							detail: completionBySection[sectionKey as ProductVerticalSectionKey]!.detail,
						})),
						productId,
						tourContext.status === "resolved" ? tourContext : {}
					),
					ready: contentReadiness.logistics,
				},

				location: observed(contentReadiness.location, completionBySection.location!.detail),
				photos: observed(contentReadiness.photos, completionBySection.photos!.detail),
				participants: observed(contentReadiness.participants, completionBySection.tickets!.detail),
				activities: observed(contentReadiness.activities, completionBySection.categories!.detail),
				option_profile: observed(
					Boolean(selectedOption?.hasProfile) && !readinessHas("missing_tour_slot_profile"),
					"Completa horario, idioma y modalidad de la opción."
				),
				group_capacity: commercialObservation(
					Boolean(commercial?.observations.capacityReady) && !readinessHas("missing_capacity"),
					"Define el máximo de participantes de esta opción."
				),
				price: commercialObservation(
					Boolean(commercial?.observations.priceReady) && !readinessHas("pricing_missing"),
					commercial?.blockerDetails?.find((blocker) => blocker.id === "price")?.label ??
						"Define un precio base positivo y una moneda válida."
				),
				conditions: commercialObservation(
					Boolean(commercial?.observations.conditionsReady),
					commercial?.blockerDetails
						?.filter((blocker) => blocker.id === "conditions")
						.map((blocker) => blocker.label)
						.join(" ") ||
						"Completa las condiciones compatibles de cancelación, pago y no presentación."
				),
				calendar_configuration: commercialObservation(
					Number(commercial?.observations.configuredDateCount ?? 0) > 0,
					"Programa al menos una fecha para esta opción."
				),
				...authorization,
				option_activation: observed(
					Boolean(selectedActiveSlotCount),
					selectedOption?.lifecycleState === "ready" && !selectedOption.salesEnabled
						? "La opción está desactivada para venta. Revisa y activa cuando corresponda."
						: "Activa esta opción desde la revisión final."
				),
				rate_activation: observed(
					Boolean(tourContext.status === "resolved" && tourContext.rate.isActive),
					"Activa esta tarifa desde la revisión final."
				),
				current_availability: {
					...commercialObservation(
						futureAvailableDateCount > 0,
						Number(commercial?.observations.futureDateCount ?? 0) === 0
							? "No hay fechas futuras programadas para esta opción."
							: Number(commercial?.observations.futureCapacityDateCount ?? 0) === 0
								? "Las fechas futuras no tienen cupo habilitado. Abre cupos en el calendario."
								: "Todos los cupos de las fechas futuras están reservados."
					),
					code: commercialReadFailed
						? "read_failed"
						: Number(commercial?.observations.futureDateCount ?? 0) === 0
							? "no_future_dates"
							: Number(commercial?.observations.futureCapacityDateCount ?? 0) === 0
								? "dates_closed"
								: "sold_out",
				},
			},
		})
		if (variantReadiness === null) {
			for (const id of ["option_profile", "group_capacity", "price"] as const) {
				tourDiagnostic.requirements[id].result = {
					state: "not_evaluable",
					reason: {
						code: "read_failed",
						message: "No se pudo comprobar la preparación de la opción.",
					},
					responsible: "fastt",
					action: {
						label: "Volver a intentar",
						href: completeToPublishStepHref(productId, "preview", tourCommercialContext),
					},
				}
			}
		}

		// Each requirement remains independent even when two corrections share an editor.
		checks.splice(
			0,
			checks.length,
			...Object.entries(tourDiagnostic.requirements).map(([id, requirement]) => {
				const presentation =
					TOUR_REQUIREMENT_PRESENTATION[id as keyof typeof TOUR_REQUIREMENT_PRESENTATION]
				const sectionKey = presentation.section
				const result = requirement.result
				const complete = result.state === "ready" || result.state === "not_applicable"
				return {
					key: id,
					sectionKey,
					label: presentation.label,
					guestImpact:
						"action" in result ? result.reason.message : "Requisito comprobado de la experiencia",
					complete,
					statusLabel: complete
						? "Listo"
						: result.state === "not_evaluable"
							? "Sin evaluar"
							: "Pendiente",
					detail: complete ? "Requisito comprobado." : result.reason.message,
					href:
						"action" in result
							? result.action.href
							: sectionHref(productId, sectionKey, tourCommercialContext),
					cta: "action" in result ? result.action.label : "Revisar",
				}
			})
		)
	}
	if (tourDiagnostic)
		checks.push({
			key: "preview",
			sectionKey: "preview",
			label: "Revisión final",
			guestImpact: "Revisión de la oferta elegida",
			complete: tourPublicationBlockers(tourDiagnostic).length === 0,
			statusLabel: "Revisión",
			detail: "Revisa esta opción y tarifa antes de publicar.",
			href: sectionHref(productId, "preview", tourCommercialContext),
			cta: "Revisar ficha",
		})

	const actionableChecks = checks.filter((check) => check.sectionKey !== "preview")
	const allActionableComplete = tourDiagnostic
		? tourPublicationBlockers(tourDiagnostic).length === 0
		: actionableChecks.every((check) => check.complete)
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
		.filter(
			(check) =>
				!check.complete &&
				(!tourDiagnostic || (check.key !== "current_availability" && check.key !== "preview"))
		)
		.sort((a, b) =>
			tourDiagnostic ? 0 : BLOCKER_ORDER.indexOf(a.sectionKey) - BLOCKER_ORDER.indexOf(b.sectionKey)
		)

	const preparationSummary = tourDiagnostic
		? summarizeTourDiagnostic(tourDiagnostic).preparation
		: null
	const completedChecks =
		preparationSummary?.readyCount ?? checks.filter((check) => check.complete).length
	const totalChecks = preparationSummary?.totalCount ?? checks.length

	return {
		checks,
		editorialStatus: String(aggregate.status ?? "draft")
			.trim()
			.toLowerCase(),
		tourContext,
		tourDiagnostic,
		blockers,
		readyToPublish: tourDiagnostic
			? tourPublicationBlockers(tourDiagnostic).length === 0
			: allActionableComplete,
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
	tourPresentation?: ReturnType<typeof presentTourDiagnostic>
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
	const progressSteps = state.tourDiagnostic
		? completeToPublishNavigationOrder("tour").map((sectionKey) => {
				const matching = orderedSteps.filter(
					(check) =>
						check.sectionKey === sectionKey ||
						(sectionKey === "location" && check.sectionKey === "subtype")
				)
				const check = matching.find((item) => !item.complete) ?? matching[0]
				const definition = getTourLaunchStepById(sectionKey)!
				return {
					...(check ?? orderedSteps[0]),
					key: check?.key ?? sectionKey,
					sectionKey,
					label: definition.label,
					guestImpact: definition.guestImpact,
					complete: matching.length > 0 && matching.every((item) => item.complete),
					href: completeToPublishStepHref(
						productId,
						sectionKey,
						state.tourContext && "variantId" in state.tourContext ? state.tourContext : {}
					),
				}
			})
		: orderedSteps

	const explicitStep = normalizeCompleteToPublishStep(String(options.currentStepId ?? ""))
	const currentStepId =
		explicitStep ||
		state.blockers[0]?.sectionKey ||
		(state.readyToPublish ? "preview" : progressSteps[0]?.sectionKey) ||
		null
	const currentIndex = progressSteps.findIndex((check) => check.sectionKey === currentStepId)
	const currentHref = currentIndex >= 0 ? progressSteps[currentIndex].href : null
	const sequentialNext =
		currentIndex >= 0
			? progressSteps.slice(currentIndex + 1).find((check) => check.href !== currentHref)
			: (progressSteps.find((check) => check.sectionKey === "preview") ?? null)

	const steps: CompleteToPublishProgressStep[] = progressSteps.map((check) => ({
		key: check.sectionKey,
		label: check.label,
		guestImpact: check.guestImpact,
		complete: check.complete,
		href: check.href,
		isCurrent: check.sectionKey === currentStepId,
		isNext: check.sectionKey === sequentialNext?.sectionKey,
		isBlocker: state.blockers.some((blocker) => blocker.key === check.key),
	}))

	return {
		playbookId: "complete-to-publish",
		tourPresentation: state.tourDiagnostic
			? presentTourDiagnostic(state.tourDiagnostic, {
					published: state.editorialStatus === "published",
					previewHref: state.checks.find((check) => check.key === "preview")!.href,
				})
			: undefined,
		productId,
		progress: {
			completedSteps: state.completedChecks,
			totalSteps: state.totalChecks,
			progressPercent: state.readinessPercent,
		},
		steps,
		blockers: steps.filter((step) => step.isBlocker),
		currentStep: currentStepId,
		nextStep: sequentialNext?.sectionKey ?? null,
		nextHref: sequentialNext
			? buildCompleteToPublishHref(sequentialNext.href, sequentialNext.sectionKey)
			: state.readyToPublish
				? buildCompleteToPublishHref(
						sectionHref(
							productId,
							"preview",
							state.tourContext && "variantId" in state.tourContext ? state.tourContext : {}
						),
						"preview"
					)
				: null,
		readyToPublish: state.readyToPublish,
		exitHref: routes.productDetail(productId),
	}
}
