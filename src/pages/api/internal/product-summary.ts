import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getProductVerticalEntry } from "@/lib/catalog/productVerticalRegistry"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { essentialHouseRuleTypes } from "@/modules/house-rules/presentation/houseRulePresentation"
import { db, eq, Hotel, Package, Tour } from "astro:db"

function toLowerTrim(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase()
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "product-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	const user = await getUserFromRequest(request)
	if (!user?.email) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "productId is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const [aggregate, variantsAggregate] = await Promise.all([
		getProductFullAggregate(productId, providerId),
		getProductVariantsAggregate(productId, providerId),
	])
	if (!aggregate) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const vertical = getProductVerticalEntry(aggregate.productType)
	const isHotel = vertical.vertical === "hotel"
	const productType = toLowerTrim(aggregate.productType)
	const imagesCount = aggregate.images.length
	const imagePreviews = aggregate.images.slice(0, 3).map((image) => ({
		id: image.id,
		url: image.url,
	}))
	const coverImage =
		aggregate.images.find((image) => image.isPrimary) ?? aggregate.images[0] ?? null
	const variants = Array.isArray(variantsAggregate?.variants) ? variantsAggregate.variants : []
	const activeVariants = variants.filter((variant) => {
		const status = toLowerTrim(variant.status)
		return status !== "archived"
	})
	const hasContent = Boolean(aggregate.content.description?.trim())
	const hasLocation = Boolean(aggregate.location.lat !== null && aggregate.location.lng !== null)
	const hasImages = imagesCount > 0
	const hasSubtype = Boolean(aggregate.subtype)
	const hasVariants = isHotel && activeVariants.length > 0
	const roomNames = activeVariants
		.map((variant) => String(variant.name ?? "").trim())
		.filter(Boolean)
		.slice(0, 3)
	const guestExpectationsSnapshot = isHotel
		? await buildGuestStayExpectationsSnapshot(productId)
		: null
	const houseRules = guestExpectationsSnapshot?.rules ?? []
	const houseRuleTypes = new Set(houseRules.map((rule: any) => String(rule.type ?? "")))
	const completedHouseRuleTypes = essentialHouseRuleTypes.filter((type) => houseRuleTypes.has(type))
	const hasHouseRules = isHotel && completedHouseRuleTypes.length >= 4

	const steps = [
		{ key: "content", complete: hasContent },
		{ key: "location", complete: hasLocation },
		{ key: "images", complete: hasImages },
		{ key: "subtype", complete: hasSubtype },
		...(isHotel
			? [
					{ key: "variants", complete: hasVariants },
					{ key: "houseRules", complete: hasHouseRules },
				]
			: []),
	]
	const completedSteps = steps.filter((item) => item.complete).length
	const missingSteps = Math.max(0, steps.length - completedSteps)
	const progressPercent = Math.round((completedSteps / steps.length) * 100)

	const highlightsCount = Array.isArray(aggregate.content.highlights)
		? aggregate.content.highlights.length
		: 0
	const descriptionPreview = hasContent
		? String(aggregate.content.description).slice(0, 180)
		: "Falta completar descripción"

	const subtypeSummary =
		aggregate.subtype?.kind === "hotel"
			? `Hotel · ${aggregate.subtype.stars ? `${aggregate.subtype.stars}★` : "Sin estrellas"}`
			: aggregate.subtype?.kind === "tour"
				? `Tour · ${aggregate.subtype.duration || "Duración no definida"}`
				: aggregate.subtype?.kind === "package"
					? `Paquete · ${aggregate.subtype.days ?? 0} días / ${aggregate.subtype.nights ?? 0} noches`
					: "Subtipo no configurado"
	let subtypeDetails: Record<string, unknown> = {}
	if (aggregate.subtype?.kind === "hotel") {
		const row = await db
			.select({
				stars: Hotel.stars,
				phone: Hotel.phone,
				email: Hotel.email,
				website: Hotel.website,
			})
			.from(Hotel)
			.where(eq(Hotel.productId, productId))
			.get()
		subtypeDetails = {
			stars: row?.stars ?? aggregate.subtype.stars ?? null,
			phone: row?.phone ?? "",
			email: row?.email ?? "",
			website: row?.website ?? "",
		}
	}
	if (aggregate.subtype?.kind === "tour") {
		const row = await db
			.select({
				duration: Tour.duration,
				difficultyLevel: Tour.difficultyLevel,
				guideLanguages: Tour.guideLanguages,
				includes: Tour.includes,
				excludes: Tour.excludes,
			})
			.from(Tour)
			.where(eq(Tour.productId, productId))
			.get()
		subtypeDetails = {
			duration: row?.duration ?? aggregate.subtype.duration ?? "",
			difficultyLevel: row?.difficultyLevel ?? aggregate.subtype.difficultyLevel ?? "",
			guideLanguages: Array.isArray(row?.guideLanguages)
				? row?.guideLanguages
				: Array.isArray(aggregate.subtype.guideLanguages)
					? aggregate.subtype.guideLanguages
					: [],
			includes: row?.includes ?? "",
			excludes: row?.excludes ?? "",
		}
	}
	if (aggregate.subtype?.kind === "package") {
		const row = await db
			.select({
				itinerary: Package.itinerary,
				days: Package.days,
				nights: Package.nights,
				includes: Package.includes,
				excludes: Package.excludes,
			})
			.from(Package)
			.where(eq(Package.productId, productId))
			.get()
		subtypeDetails = {
			itinerary: row?.itinerary ?? "",
			days: row?.days ?? aggregate.subtype.days ?? 0,
			nights: row?.nights ?? aggregate.subtype.nights ?? 0,
			includes: row?.includes ?? aggregate.subtype.includes ?? "",
			excludes: row?.excludes ?? aggregate.subtype.excludes ?? "",
		}
	}

	logEndpoint()
	return new Response(
		JSON.stringify({
			productId: aggregate.id,
			productType,
			vertical: {
				key: vertical.vertical,
				label: vertical.labels.workspaceSingular,
				singular: vertical.labels.singular,
				plural: vertical.labels.plural,
				variantSingular: vertical.labels.variantSingular,
				variantPlural: vertical.labels.variantPlural,
				readinessSummary: vertical.readiness.publishSummary,
			},
			progress: {
				completedSteps,
				totalSteps: steps.length,
				missingSteps,
				progressPercent,
			},
			checks: {
				hasContent,
				hasLocation,
				hasImages,
				hasSubtype,
				hasVariants,
				hasHouseRules,
			},
			houseRules: {
				count: houseRules.length,
				snapshotVersion: guestExpectationsSnapshot?.version ?? null,
				capturedAt: guestExpectationsSnapshot?.capturedAt ?? null,
				completedEssentials: completedHouseRuleTypes.length,
				totalEssentials: essentialHouseRuleTypes.length,
				missingEssentials: essentialHouseRuleTypes.filter((type) => !houseRuleTypes.has(type)),
			},
			content: {
				descriptionPreview,
				highlightsCount,
			},
			location: {
				address: aggregate.location.address || "Sin dirección registrada",
				coordinates:
					aggregate.location.lat !== null && aggregate.location.lng !== null
						? `${aggregate.location.lat.toFixed(6)}, ${aggregate.location.lng.toFixed(6)}`
						: "Sin coordenadas",
			},
			images: {
				count: imagesCount,
				previews: imagePreviews,
				cover: coverImage
					? {
							id: coverImage.id,
							url: coverImage.url,
						}
					: null,
			},
			variants: {
				count: isHotel ? activeVariants.length : 0,
				names: isHotel ? roomNames : [],
				hasActiveRooms: hasVariants,
			},
			subtype: {
				summary: subtypeSummary,
				details: subtypeDetails,
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
