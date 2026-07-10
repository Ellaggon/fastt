import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getProductVerticalEntry } from "@/lib/catalog/productVerticalRegistry"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { summarizeProductPreparation } from "@/lib/playbook/summarize-product-preparation"
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { essentialHouseRuleTypes } from "@/modules/house-rules/presentation/houseRulePresentation"
import { db, eq, Hotel, Package, ProductStatus, Tour } from "astro:db"

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

	const [aggregate, variantsAggregate, statusRow] = await Promise.all([
		getProductFullAggregate(productId, providerId),
		getProductVariantsAggregate(productId, providerId),
		db
			.select({ state: ProductStatus.state })
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, productId))
			.get(),
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
				meetingPointJson: Tour.meetingPointJson,
				itineraryJson: Tour.itineraryJson,
				safetyJson: Tour.safetyJson,
				guideJson: Tour.guideJson,
			})
			.from(Tour)
			.where(eq(Tour.productId, productId))
			.get()
		subtypeDetails = {
			duration: row?.duration ?? aggregate.subtype.duration ?? "",
			difficultyLevel: row?.difficultyLevel ?? aggregate.subtype.difficultyLevel ?? "",
			meetingPoint: row?.meetingPointJson ?? aggregate.subtype.meetingPoint ?? null,
			itinerary: row?.itineraryJson ?? aggregate.subtype.itinerary ?? null,
			safety: row?.safetyJson ?? aggregate.subtype.safety ?? null,
			guide: row?.guideJson ?? aggregate.subtype.guide ?? null,
		}
	}
	if (aggregate.subtype?.kind === "package") {
		const row = await db
			.select({
				days: Package.days,
				nights: Package.nights,
				itineraryJson: Package.itineraryJson,
				includesJson: Package.includesJson,
				excludesJson: Package.excludesJson,
			})
			.from(Package)
			.where(eq(Package.productId, productId))
			.get()
		subtypeDetails = {
			itinerary: row?.itineraryJson ?? aggregate.subtype.itinerary ?? null,
			days: row?.days ?? aggregate.subtype.days ?? 0,
			nights: row?.nights ?? aggregate.subtype.nights ?? 0,
			includes: row?.includesJson ?? aggregate.subtype.includes ?? null,
			excludes: row?.excludesJson ?? aggregate.subtype.excludes ?? null,
		}
	}

	const productStatus = String(statusRow?.state ?? "draft")
		.trim()
		.toLowerCase()
	const preparation = await summarizeProductPreparation({
		productId,
		providerId,
		status: productStatus,
		request,
		url,
	})

	logEndpoint()
	return new Response(
		JSON.stringify({
			productId: aggregate.id,
			productType,
			status: productStatus,
			preparation: preparation
				? {
						statusLabel: preparation.statusLabel,
						readinessPercent: preparation.readinessPercent,
						blockerCount: preparation.blockerCount,
						blockerPreview: preparation.blockerPreview,
						readyToPublish: preparation.readyToPublish,
						continuePreparationHref: preparation.continuePreparationHref,
						previewHref: preparation.previewHref,
						nextStepLabel: preparation.nextStepLabel,
						isPublished: preparation.isPublished,
					}
				: null,
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
