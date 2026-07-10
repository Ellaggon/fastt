import { POLICY_CATEGORY_ORDER } from "@/data/policy/policy-categories"
import {
	getProductVerticalEntry,
	type ProductVerticalSectionKey,
} from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import { buildCompleteToPublishHref } from "@/lib/playbook/complete-to-publish"
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import {
	essentialHouseRuleTypes,
	houseRuleLabels,
} from "@/modules/house-rules/presentation/houseRulePresentation"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"

export type CompleteToPublishCheck = {
	key: string
	sectionKey: ProductVerticalSectionKey
	label: string
	guestImpact: string
	complete: boolean
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
	const description = String(aggregate.content.description ?? "").trim()
	const highlights = Array.isArray(aggregate.content.highlights) ? aggregate.content.highlights : []
	const packageIncludes =
		aggregate.subtype?.kind === "package" ? String(aggregate.subtype.includes ?? "").trim() : ""
	const packageInclusionItems = packageIncludes
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean)

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
	if (isHotel) {
		const variantsAggregate = await getProductVariantsAggregate(productId, providerId)
		variantsCount = variantsAggregate?.variants?.length ?? 0
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
		Record<ProductVerticalSectionKey, { complete: boolean; detail: string }>
	> = {
		identity: { complete: true, detail: "Nombre y tipo configurados." },
		content: {
			complete: Boolean(description && highlights.length),
			detail:
				description && highlights.length
					? "Descripción y destacados listos."
					: "Agrega descripción y al menos un destacado.",
		},
		photos: {
			complete: aggregate.images.length > 0,
			detail: aggregate.images.length
				? `${aggregate.images.length} fotos disponibles.`
				: "Agrega al menos una foto.",
		},
		location: {
			complete: aggregate.location.lat !== null && aggregate.location.lng !== null,
			detail:
				aggregate.location.lat !== null && aggregate.location.lng !== null
					? "Coordenadas configuradas."
					: "Agrega coordenadas antes de publicar.",
		},
		subtype: {
			complete: Boolean(aggregate.subtype),
			detail: aggregate.subtype ? "Detalles del subtipo configurados." : "Completa los detalles.",
		},
		rooms: {
			complete: !isHotel || variantsCount > 0,
			detail: !isHotel
				? "No aplica para este tipo de oferta."
				: variantsCount === 0
					? "Crea al menos una habitación."
					: `${variantsCount} habitación${variantsCount === 1 ? "" : "es"} configurada${variantsCount === 1 ? "" : "s"}.`,
		},
		houseRules: {
			complete: !isHotel || missingHouseRules.length === 0,
			detail: !isHotel
				? "No aplica para este tipo de oferta."
				: missingHouseRules.length
					? `Faltan: ${missingHouseRules.map((type) => houseRuleLabels[type] ?? type).join(", ")}.`
					: "Reglas principales listas.",
		},
		bookingPolicies: {
			complete: missingPolicies.length === 0 && !policyResolutionError,
			detail: policyResolutionError
				? "No se pudieron resolver las condiciones."
				: missingPolicies.length
					? `Faltan: ${missingPolicies.map((category) => POLICY_CATEGORY_ORDER[category as keyof typeof POLICY_CATEGORY_ORDER] ?? category).join(", ")}.`
					: "Condiciones principales visibles.",
		},
		itinerary: {
			complete: Boolean(
				aggregate.subtype?.kind === "tour" &&
				(aggregate.subtype.itinerary || aggregate.subtype.duration)
			),
			detail: "Completa itinerario y duración del tour.",
		},
		inclusions: {
			complete: packageInclusionItems.length > 0,
			detail: packageInclusionItems.length
				? `${packageInclusionItems.length} inclusiones visibles.`
				: "Agrega qué incluye el paquete antes de publicar.",
		},
		preview: { complete: false, detail: "Revisa la ficha y publica cuando todo esté listo." },
	}

	const requiredSections = vertical.readiness.requiredSections.filter(
		(section) => section !== "identity"
	)

	const checks: CompleteToPublishCheck[] = requiredSections.map((section) => {
		const completion = completionBySection[section] ?? {
			complete: false,
			detail: "Pendiente de completar.",
		}
		return {
			key: section,
			sectionKey: section,
			label: sectionLabel(section, verticalLabel),
			guestImpact: SECTION_GUEST_IMPACT[section] ?? "Información visible para el huésped",
			complete: completion.complete,
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

	const orderedSteps = [
		...state.checks.filter((check) => !check.complete),
		...state.checks.filter((check) => check.complete),
	]

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
