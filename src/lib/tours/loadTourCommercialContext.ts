import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	and,
	db,
	desc,
	eq,
	first,
	Product,
	ProviderPreparationSession,
	RatePlan,
	TourSlotProfile,
	Variant,
	VariantCapacity,
} from "@/shared/infrastructure/db/compat"
import {
	resolveTourCommercialContext,
	tourContextSelectionHref,
	withTourCommercialContext,
	type TourContextResolution,
	type TourOfferOption,
	type TourSelectionHint,
} from "./resolveTourCommercialContext"

export type LoadedTourContext =
	| TourContextResolution
	| { status: "not_found" | "not_tour" | "read_failed"; productId: string }
type Input = {
	providerId: string
	productId: string
	request?: Request
	url?: URL
	selection?: TourSelectionHint
	session?: TourSelectionHint
	userId?: string
}

function selectionHint(input: Input): TourSelectionHint {
	const url = {
		variantId: input.url?.searchParams.get("variantId"),
		ratePlanId: input.url?.searchParams.get("ratePlanId"),
	}
	return url.variantId?.trim() || url.ratePlanId?.trim() ? url : (input.selection ?? url)
}

/** Rate/calendar entries may have only an option or rate ID; infer product through owned joins. */
export async function loadTourCommercialEntryContext(
	input: Input
): Promise<LoadedTourContext | null> {
	if (input.productId) return loadTourCommercialContext(input)
	const hint = selectionHint(input)
	if (!hint.variantId && !hint.ratePlanId) return null
	try {
		const query = db
			.select({ productId: Product.id })
			.from(Product)
			.innerJoin(Variant, eq(Variant.productId, Product.id))
		const conditions = [eq(Product.providerId, input.providerId)]
		if (hint.variantId) conditions.push(eq(Variant.id, hint.variantId))
		const product = hint.ratePlanId
			? await query
					.innerJoin(RatePlan, eq(RatePlan.variantId, Variant.id))
					.where(and(...conditions, eq(RatePlan.id, hint.ratePlanId)))
					.then(first)
			: await query.where(and(...conditions)).then(first)
		if (!product) return { status: "not_found", productId: "" }
		return loadTourCommercialContext({ ...input, productId: product.productId })
	} catch {
		return { status: "read_failed", productId: "" }
	}
}

export function tourContextValidationResponse(context: LoadedTourContext): Response | null {
	const error = context.status === "unresolved" ? context.reason : context.status
	if (!["read_failed", "not_found", "invalid_selection", "selection_required"].includes(error))
		return null
	return new Response(
		JSON.stringify({
			error,
			message:
				error === "read_failed"
					? "No se pudo consultar la oferta. Reintenta."
					: error === "not_found"
						? "No se encontró este tour."
						: "Selecciona una opción y tarifa válidas para este tour.",
			...(error === "invalid_selection" || error === "selection_required"
				? { selectionHref: `/product/${encodeURIComponent(context.productId)}/select-offer` }
				: {}),
			action:
				error === "read_failed"
					? {
							label: "Volver a intentar",
							href: `/product/${encodeURIComponent(context.productId)}/preview`,
						}
					: error === "not_found"
						? { label: "Volver a mis tours", href: "/catalog/tours" }
						: {
								label: "Elegir oferta",
								href: `/product/${encodeURIComponent(context.productId)}/select-offer`,
							},
		}),
		{
			status:
				error === "read_failed"
					? 503
					: error === "not_found"
						? 404
						: error === "invalid_selection"
							? 400
							: 409,
			headers: { "Content-Type": "application/json" },
		}
	)
}

/** Shared entry behavior for preview, calendar and rate management. Hotels remain unaltered. */
export function tourContextEntryResponse(context: LoadedTourContext, url: URL): Response | null {
	if (context.status === "not_tour") return null
	if (context.status === "not_found") return new Response("Oferta no encontrada", { status: 404 })
	if (context.status === "read_failed")
		return new Response("No se pudo consultar la oferta. Reintenta.", { status: 503 })
	if (!("options" in context)) return null
	if (context.status === "unresolved" && context.reason === "invalid_selection")
		return new Response("La opción o tarifa no pertenece a este tour.", { status: 400 })
	let href: string | null = null
	if (context.status === "unresolved" && context.reason === "selection_required")
		href = tourContextSelectionHref(context, url.pathname + url.search)
	else if (context.variantId) {
		const target = new URL(withTourCommercialContext(url.pathname + url.search, context), url)
		if (target.pathname.startsWith("/rates/"))
			target.searchParams.set("productId", context.productId)
		const canonical = target.pathname + target.search
		if (canonical !== url.pathname + url.search) href = canonical
	}
	return href ? new Response(null, { status: 302, headers: { Location: href } }) : null
}
const requestCache = new WeakMap<Request, Map<string, Promise<LoadedTourContext>>>()

export function loadTourCommercialContext(input: Input): Promise<LoadedTourContext> {
	if (!input.request) return load(input)
	let cache = requestCache.get(input.request)
	if (!cache) {
		cache = new Map()
		requestCache.set(input.request, cache)
	}
	const hint = selectionHint(input)
	const key = JSON.stringify([
		input.providerId,
		input.productId,
		input.userId,
		input.session,
		input.url?.searchParams.get("productId"),
		hint.variantId?.trim() || null,
		hint.ratePlanId?.trim() || null,
	])
	const existing = cache.get(key)
	if (existing) return existing
	const pending = load(input)
	cache.set(key, pending)
	return pending
}

async function load(input: Input): Promise<LoadedTourContext> {
	try {
		const product = await db
			.select({ id: Product.id, productType: Product.productType })
			.from(Product)
			.where(and(eq(Product.id, input.productId), eq(Product.providerId, input.providerId)))
			.then(first)
		if (!product) return { status: "not_found", productId: input.productId }
		if (String(product.productType).toLowerCase() !== "tour")
			return { status: "not_tour", productId: input.productId }
		const rows = await db
			.select({
				variantId: Variant.id,
				name: Variant.name,
				lifecycleState: Variant.lifecycleState,
				salesEnabled: Variant.salesEnabled,
				profileId: TourSlotProfile.variantId,
				capacityId: VariantCapacity.variantId,
				bookingMode: TourSlotProfile.bookingMode,
				ratePlanId: RatePlan.id,
				rateName: RatePlan.name,
				isActive: RatePlan.isActive,
				isDefault: RatePlan.isDefault,
			})
			.from(Variant)
			.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(RatePlan, eq(RatePlan.variantId, Variant.id))
			.where(and(eq(Variant.productId, input.productId), eq(Variant.kind, "tour_slot")))
		const options = new Map<string, TourOfferOption>()
		for (const row of rows) {
			let option = options.get(row.variantId)
			if (!option) {
				option = {
					variantId: row.variantId,
					name: row.name,
					lifecycleState: String(row.lifecycleState),
					salesEnabled: row.salesEnabled === true,
					hasProfile: Boolean(row.profileId),
					hasCapacity: Boolean(row.capacityId),
					bookingMode:
						row.bookingMode === "shared" || row.bookingMode === "private" ? row.bookingMode : null,
					rates: [],
				}
				options.set(row.variantId, option)
			}
			if (row.ratePlanId)
				option.rates.push({
					ratePlanId: row.ratePlanId,
					name: row.rateName ?? "Tarifa",
					isActive: row.isActive === true,
					isDefault: row.isDefault === true,
				})
		}
		if (
			input.url?.searchParams.get("productId") &&
			input.url.searchParams.get("productId") !== input.productId
		) {
			return {
				productId: input.productId,
				options: [...options.values()],
				variantId: null,
				ratePlanId: null,
				status: "unresolved",
				reason: "invalid_selection",
			}
		}
		const url = selectionHint(input)
		let session: TourSelectionHint | undefined = input.session
		if (!session && !url.variantId?.trim() && !url.ratePlanId?.trim()) {
			const userId =
				input.userId ?? (input.request ? (await getUserFromRequest(input.request))?.id : undefined)
			if (userId) {
				const saved = await db
					.select({
						variantId: ProviderPreparationSession.variantId,
						ratePlanId: ProviderPreparationSession.ratePlanId,
					})
					.from(ProviderPreparationSession)
					.where(
						and(
							eq(ProviderPreparationSession.providerId, input.providerId),
							eq(ProviderPreparationSession.userId, userId),
							eq(ProviderPreparationSession.productId, input.productId),
							eq(ProviderPreparationSession.vertical, "tour"),
							eq(ProviderPreparationSession.status, "active")
						)
					)
					.orderBy(desc(ProviderPreparationSession.updatedAt))
					.limit(1)
					.then(first)
				session = saved ?? undefined
			}
		}
		return resolveTourCommercialContext({
			productId: input.productId,
			options: [...options.values()],
			url,
			session,
		})
	} catch (error) {
		console.error(
			"tour-commercial-context: read failed",
			error instanceof Error ? error.message : "unknown"
		)
		return { status: "read_failed", productId: input.productId }
	}
}
