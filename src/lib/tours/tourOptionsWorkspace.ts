import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { evaluateTourCapabilities } from "./buildTourDiagnostic"
import type { TourDiagnostic, TourRequirementId } from "./tourDiagnosticContract"
import { buildTourCommercialLinks } from "./tourProviderNavigation"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import { providerLocalToday } from "@/lib/rates/providerLocalToday"
import { sellableDailyInventoryCondition } from "@/lib/rates/sellableDailyInventoryCondition"
import {
	and,
	asc,
	db,
	eq,
	gt,
	inArray,
	ne,
	Product,
	RatePlan,
	sql,
	TourSlotProfile,
	Variant,
	VariantCapacity,
	DailyInventory,
} from "@/shared/infrastructure/db/compat"

export type OptionState =
	| "available"
	| "requests"
	| "pending"
	| "disabled"
	| "unknown"
	| "draft"
	| "inactive"
	| "no_dates"
	| "no_capacity"
	| "sold_out"
type Action = { label: string; href: string }
export type OptionProfile = {
	id: string
	name: string
	departureTime: string | null
	maxPax: number | null
	languageCode: string | null
	bookingMode: string | null
	profileActive: boolean | null
}
export type OptionRateObservation = { id: string; name: string; diagnosis: TourDiagnostic | null }
export type OptionRateSummary = OptionRateObservation & {
	label: string
	issue: boolean
	unknown: boolean
	action: Action
}
export type OptionSummary = OptionProfile & {
	state: OptionState
	label: string
	detail: string
	primary: Action
	rates: OptionRateSummary[]
	links: ReturnType<typeof buildTourCommercialLinks>
	nextAvailableDate: string | null
}

function contextualAction(action: Action, returnTo: string): Action {
	const url = new URL(action.href, "http://fastt.local")
	url.searchParams.set("returnTo", returnTo)
	return { ...action, href: url.pathname + url.search + url.hash }
}

/** Presents existing decisions; never infers readiness from persisted ready or a default rate. */
export function presentTourOption(input: {
	productId: string
	published: boolean
	profile: OptionProfile
	rates: OptionRateObservation[]
	nextAvailableDate?: string | null
}): OptionSummary {
	const { productId, profile } = input
	const returnTo = `${routes.productDeparturesForProduct(productId)}#option-${encodeURIComponent(profile.id)}`
	const rawLinks = buildTourCommercialLinks({ productId, variantId: profile.id })
	const links = Object.fromEntries(
		Object.entries(rawLinks).map(([key, href]) => [
			key,
			contextualAction({ label: key, href }, returnTo).href,
		])
	) as typeof rawLinks
	const edit = {
		label: "Completar opción",
		href: routes.productDepartureDetail(productId, profile.id),
	}
	const calendar = { label: "Gestionar fechas y cupos", href: links.calendarHref }
	const retry = { label: "Reintentar", href: returnTo }
	const order: TourRequirementId[] = [
		"option_profile",
		"group_capacity",
		"price",
		"conditions",
		"provider_authorization",
		"experience_authorization",
		"calendar_configuration",
		"option_activation",
		"rate_activation",
		"current_availability",
		"presentation",
		"logistics",
		"location",
		"photos",
		"participants",
		"activities",
	]
	const rates = input.rates.map((rate): OptionRateSummary => {
		const diagnosis = rate.diagnosis
		if (!diagnosis)
			return { ...rate, label: "No se pudo comprobar", issue: true, unknown: true, action: retry }
		const capabilities = evaluateTourCapabilities(diagnosis)
		const mode =
			diagnosis.context.selection.state === "resolved"
				? diagnosis.context.selection.bookingMode
				: null
		const permitted =
			mode === "private" ? capabilities.receive_request.allowed : capabilities.book.allowed
		if (permitted)
			return {
				...rate,
				label: input.published ? "Configuración válida" : "Configuración válida · tour en borrador",
				issue: false,
				unknown: false,
				action: contextualAction(
					{
						label: "Revisar tarifa",
						href: buildTourCommercialLinks({
							productId,
							variantId: profile.id,
							ratePlanId: rate.id,
						}).conditionsHref,
					},
					returnTo
				),
			}
		const unknown = Object.values(diagnosis.requirements).some(
			({ result }) => result.state === "not_evaluable"
		)
		const next = order
			.map((id) => ({ id, result: diagnosis.requirements[id].result }))
			.find(({ result }) => "action" in result)
		return {
			...rate,
			label: unknown
				? "No se pudo comprobar"
				: next && "reason" in next.result
					? next.result.reason.message
					: "Revisión pendiente",
			issue: true,
			unknown,
			action: unknown
				? retry
				: next && "action" in next.result
					? contextualAction(next.result.action, returnTo)
					: retry,
		}
	})
	const base = { ...profile, links, rates, nextAvailableDate: input.nextAvailableDate ?? null }
	const result = (
		state: OptionState,
		label: string,
		detail: string,
		primary: Action
	): OptionSummary => ({
		...base,
		state,
		label,
		detail,
		primary: contextualAction(primary, returnTo),
	})
	if (profile.profileActive === false)
		return result(
			"disabled",
			"Deshabilitada",
			"Revisa la opción para habilitarla cuando corresponda.",
			{ ...edit, label: "Editar opción" }
		)
	if (
		!profile.departureTime ||
		!profile.languageCode ||
		!["shared", "private"].includes(profile.bookingMode ?? "") ||
		!(Number(profile.maxPax) > 0)
	)
		return result(
			"pending",
			"Configuración pendiente",
			"Completa horario, idioma, modalidad y capacidad.",
			edit
		)
	if (!rates.length)
		return result("pending", "Precio pendiente", "Esta opción todavía no tiene una tarifa.", {
			label: "Configurar precio",
			href: links.priceHref,
		})
	const valid = rates.filter((rate) => !rate.issue)
	if (valid.length) {
		const issues = rates.filter((rate) => rate.issue).length
		const detail = issues
			? `${valid.length} ${valid.length === 1 ? "tarifa válida" : "tarifas válidas"}; ${issues} ${issues === 1 ? "tarifa necesita" : "tarifas necesitan"} revisión.`
			: ""
		if (!input.published)
			return result(
				"draft",
				"Configuración comercial completa",
				`Tour en borrador.${detail ? ` ${detail}` : ""}`,
				{
					label: "Revisar publicación",
					href: `${routes.productPreview(productId)}?variantId=${encodeURIComponent(profile.id)}`,
				}
			)
		if (profile.bookingMode === "private")
			return result(
				"requests",
				"Solicitudes habilitadas",
				detail || "Las solicitudes no confirman reservas ni retienen cupos.",
				{
					label: "Revisar solicitudes",
					href: `/product/${encodeURIComponent(productId)}/private-requests`,
				}
			)
		return result(
			"available",
			valid.length === rates.length ? "Disponible para reservar" : "Disponible con tarifas válidas",
			detail,
			calendar
		)
	}
	if (rates.some((rate) => rate.unknown))
		return result(
			"unknown",
			"No se pudo comprobar",
			"Reintenta para verificar todas las tarifas de esta opción.",
			retry
		)
	const commonPending = order.find((id) =>
		rates.every(
			({ diagnosis }) =>
				diagnosis && !["ready", "not_applicable"].includes(diagnosis.requirements[id].result.state)
		)
	)
	if (
		rates.length > 1 &&
		(!commonPending || ["price", "conditions", "rate_activation"].includes(commonPending))
	)
		return result(
			"pending",
			"Tarifas pendientes",
			"Revisa el detalle de cada tarifa; ninguna está habilitada para operar.",
			{ label: "Revisar tarifas", href: links.conditionsHref }
		)
	const rate = rates[0]
	const diagnosis = rate.diagnosis!
	const pending =
		rates.length > 1
			? commonPending
			: order.find((id) => {
					const state = diagnosis.requirements[id].result.state
					return state !== "ready" && state !== "not_applicable"
				})
	const pendingResult = pending ? diagnosis.requirements[pending].result : null
	const correction =
		pendingResult && "action" in pendingResult
			? contextualAction(pendingResult.action, returnTo)
			: rate.action
	const detail =
		rates.length > 1 && pendingResult && "reason" in pendingResult
			? pendingResult.reason.message
			: `${rate.name}: ${rate.label}`
	const labels: Partial<Record<TourRequirementId, string>> = {
		option_profile: "Configuración pendiente",
		group_capacity: "Capacidad pendiente",
		price: "Precio pendiente",
		conditions: "Condiciones pendientes",
		provider_authorization: "Habilitación pendiente",
		experience_authorization: "Habilitación pendiente",
		calendar_configuration: "Sin fechas configuradas",
		option_activation: "Activación pendiente",
		rate_activation: "Activación pendiente",
	}
	if (pending === "current_availability") {
		const observation = diagnosis.requirements.current_availability.result
		const code = "reason" in observation ? observation.reason.code : ""
		const state =
			code === "sold_out" ? "sold_out" : code === "dates_closed" ? "no_capacity" : "no_dates"
		return result(
			state,
			state === "sold_out"
				? "Próximas salidas agotadas"
				: state === "no_capacity"
					? "Sin cupos habilitados"
					: "Sin próximas fechas",
			rate.label,
			calendar
		)
	}
	const activationOnly =
		(pending === "option_activation" || pending === "rate_activation") &&
		rates.every(
			({ diagnosis }) => diagnosis && evaluateTourCapabilities(diagnosis).activate.allowed
		)
	return result(
		pending === "option_activation" || pending === "rate_activation" ? "inactive" : "pending",
		activationOnly ? "Lista para activar" : (labels[pending!] ?? "Preparación del tour pendiente"),
		detail,
		{
			...correction,
			label:
				pending === "conditions"
					? "Revisar condiciones"
					: pending === "price"
						? "Configurar precio"
						: correction.label,
		}
	)
}

export function summarizeTourOptions(rows: OptionSummary[]) {
	return {
		total: rows.length,
		available: rows.filter((row) => row.state === "available").length,
		requests: rows.filter((row) => row.state === "requests").length,
		disabled: rows.filter((row) => row.state === "disabled").length,
		unknown: rows.filter((row) => row.state === "unknown").length,
		attention: rows.filter(
			(row) => !["available", "requests", "disabled", "unknown"].includes(row.state)
		).length,
	}
}

export async function loadTourOptionsWorkspace(input: {
	providerId: string
	productId: string
	request: Request
}) {
	const product = await db
		.select({
			id: Product.id,
			name: Product.name,
			status: Product.publicationState,
			productType: Product.productType,
			imageUrl: sql<
				string | null
			>`(select image."url" from "ProductImage" link join "Image" image on image."id" = link."imageId" where link."productId" = "Product"."id" order by link."isPrimary" desc, link."sortOrder", link."imageId" limit 1)`,
		})
		.from(Product)
		.where(and(eq(Product.id, input.productId), eq(Product.providerId, input.providerId)))
		.then((rows) => rows[0])
	if (!product || !isTourProductType(product.productType)) return null
	const rows = await db
		.select({
			id: Variant.id,
			name: Variant.name,
			departureTime: TourSlotProfile.departureTime,
			maxPax: TourSlotProfile.maxPax,
			capacity: VariantCapacity.maxOccupancy,
			languageCode: TourSlotProfile.languageCode,
			bookingMode: TourSlotProfile.bookingMode,
			profileActive: TourSlotProfile.isActive,
			rateId: RatePlan.id,
			rateName: RatePlan.name,
		})
		.from(Variant)
		.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
		.leftJoin(RatePlan, eq(RatePlan.variantId, Variant.id))
		.where(
			and(
				eq(Variant.productId, input.productId),
				eq(Variant.kind, "tour_slot"),
				ne(Variant.lifecycleState, "archived")
			)
		)
		.orderBy(
			asc(TourSlotProfile.departureTime),
			asc(Variant.name),
			asc(RatePlan.name),
			asc(RatePlan.id)
		)
	const profiles = new Map<
		string,
		{ profile: OptionProfile; rates: Array<{ id: string; name: string }> }
	>()
	for (const row of rows) {
		let option = profiles.get(row.id)
		if (!option) {
			option = {
				profile: {
					id: row.id,
					name: row.name,
					departureTime: row.departureTime,
					maxPax: row.maxPax ?? row.capacity,
					languageCode: row.languageCode,
					bookingMode: row.bookingMode,
					profileActive: row.profileActive,
				},
				rates: [],
			}
			profiles.set(row.id, option)
		}
		if (row.rateId) option.rates.push({ id: row.rateId, name: row.rateName ?? "Tarifa" })
	}
	const ids = [...profiles.keys()]
	const dates = ids.length
		? await db
				.select({
					variantId: DailyInventory.variantId,
					next: sql<string>`min(${DailyInventory.date})`,
				})
				.from(DailyInventory)
				.where(
					and(
						inArray(DailyInventory.variantId, ids),
						gt(DailyInventory.date, providerLocalToday(input.productId)),
						sellableDailyInventoryCondition()
					)
				)
				.groupBy(DailyInventory.variantId)
		: []
	const nextDate = new Map(dates.map((row) => [row.variantId, row.next]))
	const observations = new Map<string, OptionRateObservation[]>()
	const jobs = [...profiles.values()].flatMap((option) =>
		option.rates.map((rate) => ({ option, rate }))
	)
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(3, jobs.length) }, async () => {
			while (cursor < jobs.length) {
				const { option, rate } = jobs[cursor++]
				const state = await loadCompleteToPublishState({
					...input,
					selection: { variantId: option.profile.id, ratePlanId: rate.id },
				}).catch(() => null)
				const rates = observations.get(option.profile.id) ?? []
				rates.push({ ...rate, diagnosis: state?.tourDiagnostic ?? null })
				observations.set(option.profile.id, rates)
			}
		})
	)
	const summaries = [...profiles.values()].map((option) =>
		presentTourOption({
			productId: input.productId,
			published: product.status === "published",
			profile: option.profile,
			rates: option.rates.map(
				(rate) =>
					observations
						.get(option.profile.id)
						?.find((observation) => observation.id === rate.id) ?? { ...rate, diagnosis: null }
			),
			nextAvailableDate: nextDate.get(option.profile.id),
		})
	)
	return { product, rows: summaries, summary: summarizeTourOptions(summaries) }
}
