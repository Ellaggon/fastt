import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	db,
	Destination,
	eq,
	GeoPlace,
	GeoPlaceAlias,
	LegacyDestinationGeoPlaceMap,
	Product,
	ProductGeoPlace,
	ProductGeoPlaceBackfill,
	ProductLocation,
} from "@/shared/infrastructure/db/compat"
import {
	resolveLegacyDestination,
	resolveProductGeoPlace,
	type GeoBackfillResolution,
} from "@/modules/catalog/public"
import { BOLIVIA_MARKETPLACE_CATALOG_VERSION } from "@/data/geography/bolivia-marketplace-catalog"

const APPLY = process.argv.includes("--apply")
const CONFIRMED = process.env.CONFIRM_GEO_BACKFILL === "apply"

type PersistedDestinationResolution =
	| GeoBackfillResolution
	| {
			placeId: string | null
			resolutionStatus: "confirmed" | "rejected"
			matchMethod: "manual" | "unmatched"
			confidence: number
			distanceMeters: number | null
			evidence: Record<string, unknown>
	  }

function mapId(destinationId: string) {
	return `geo:legacy-destination:${destinationId}`
}

function productBackfillId(productId: string) {
	return `geo:product-backfill:${productId}`
}

function productGeoPlaceId(productId: string) {
	return `geo:product-place:${productId}`
}

function usableLegacyResolution(
	resolution: PersistedDestinationResolution | undefined
): GeoBackfillResolution | null {
	if (!resolution || resolution.resolutionStatus === "rejected") return null
	return {
		placeId: resolution.placeId,
		resolutionStatus: resolution.resolutionStatus,
		matchMethod: resolution.matchMethod === "manual" ? "unmatched" : resolution.matchMethod,
		confidence: resolution.confidence,
		distanceMeters: resolution.distanceMeters,
		evidence: resolution.evidence,
	}
}

async function readBackfillInputs() {
	const [places, aliases, destinations, existingMaps, products, existingPrimaryRelations] =
		await Promise.all([
			db.select().from(GeoPlace),
			db.select().from(GeoPlaceAlias),
			db.select().from(Destination),
			db.select().from(LegacyDestinationGeoPlaceMap),
			db
				.select({
					id: Product.id,
					destinationId: Product.destinationId,
					address: ProductLocation.address,
					latitude: ProductLocation.lat,
					longitude: ProductLocation.lng,
				})
				.from(Product)
				.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id)),
			db
				.select({ productId: ProductGeoPlace.productId })
				.from(ProductGeoPlace)
				.where(eq(ProductGeoPlace.isPrimary, true)),
		])

	return { places, aliases, destinations, existingMaps, products, existingPrimaryRelations }
}

async function run() {
	if (APPLY && !CONFIRMED) {
		throw new Error("GEO_BACKFILL_CONFIRMATION_REQUIRED: rerun with CONFIRM_GEO_BACKFILL=apply")
	}

	const { places, aliases, destinations, existingMaps, products, existingPrimaryRelations } =
		await readBackfillInputs()
	const persistedMapsByDestination = new Map(
		existingMaps.map((map) => [map.legacyDestinationId, map])
	)
	const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]))
	const destinationMapIds = new Map(
		destinations.map((destination) => [
			destination.id,
			persistedMapsByDestination.get(destination.id)?.id ?? mapId(destination.id),
		])
	)
	const existingPrimaryProductIds = new Set(
		existingPrimaryRelations.map((relation) => relation.productId)
	)
	const destinationResolutions = new Map<string, PersistedDestinationResolution>()

	for (const destination of destinations) {
		const persisted = persistedMapsByDestination.get(destination.id)
		if (persisted?.resolutionStatus === "confirmed" || persisted?.resolutionStatus === "rejected") {
			destinationResolutions.set(destination.id, {
				placeId: persisted.placeId,
				resolutionStatus: persisted.resolutionStatus,
				matchMethod: persisted.matchMethod === "manual" ? "manual" : "unmatched",
				confidence: persisted.confidence,
				distanceMeters: persisted.distanceMeters,
				evidence: (persisted.evidenceJson as Record<string, unknown> | null) ?? {},
			})
			continue
		}
		destinationResolutions.set(
			destination.id,
			resolveLegacyDestination(destination, places, aliases)
		)
	}

	const productResolutions = products.map((product) => {
		const legacyResolution = destinationResolutions.get(product.destinationId)
		const destination = destinationsById.get(product.destinationId)
		const candidateProduct = { ...product, country: destination?.country ?? "" }
		return {
			product: candidateProduct,
			resolution: resolveProductGeoPlace({
				product: candidateProduct,
				legacyResolution: usableLegacyResolution(legacyResolution),
				places,
				aliases,
				hasExistingPrimary: existingPrimaryProductIds.has(product.id),
			}),
		}
	})

	const destinationSummary = [...destinationResolutions.values()].reduce<Record<string, number>>(
		(summary, resolution) => {
			summary[resolution.resolutionStatus] = (summary[resolution.resolutionStatus] ?? 0) + 1
			return summary
		},
		{}
	)
	const productSummary = productResolutions.reduce<Record<string, number>>((summary, entry) => {
		summary[entry.resolution.resolutionStatus] =
			(summary[entry.resolution.resolutionStatus] ?? 0) + 1
		return summary
	}, {})
	const legacyDestinationsByCanonicalPlace = new Map<string, number>()
	for (const resolution of destinationResolutions.values()) {
		if (
			!resolution.placeId ||
			!["auto_matched", "confirmed"].includes(resolution.resolutionStatus)
		) {
			continue
		}
		legacyDestinationsByCanonicalPlace.set(
			resolution.placeId,
			(legacyDestinationsByCanonicalPlace.get(resolution.placeId) ?? 0) + 1
		)
	}
	const deduplicatedLegacyDestinations = [...legacyDestinationsByCanonicalPlace.values()].reduce(
		(total, count) => total + Math.max(0, count - 1),
		0
	)

	if (APPLY) {
		const now = new Date()
		await db.transaction(async (tx) => {
			for (const destination of destinations) {
				const persisted = persistedMapsByDestination.get(destination.id)
				if (
					persisted?.resolutionStatus === "confirmed" ||
					persisted?.resolutionStatus === "rejected"
				)
					continue
				const resolution = destinationResolutions.get(destination.id)!
				await tx
					.insert(LegacyDestinationGeoPlaceMap)
					.values({
						id: mapId(destination.id),
						legacyDestinationId: destination.id,
						placeId: resolution.placeId,
						resolutionStatus: resolution.resolutionStatus,
						matchMethod: resolution.matchMethod,
						confidence: resolution.confidence,
						distanceMeters: resolution.distanceMeters,
						evidenceJson: resolution.evidence,
						catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
						createdAt: now,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: LegacyDestinationGeoPlaceMap.legacyDestinationId,
						set: {
							placeId: resolution.placeId,
							resolutionStatus: resolution.resolutionStatus,
							matchMethod: resolution.matchMethod,
							confidence: resolution.confidence,
							distanceMeters: resolution.distanceMeters,
							evidenceJson: resolution.evidence,
							catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
							updatedAt: now,
						},
					})
			}

			for (const { product, resolution } of productResolutions) {
				const matchedPlaceId =
					resolution.resolutionStatus === "auto_matched" ? resolution.placeId : null
				const autoApply = matchedPlaceId != null
				let appliedProductGeoPlaceId: string | null = null
				if (autoApply) {
					const nextProductGeoPlaceId = productGeoPlaceId(product.id)
					appliedProductGeoPlaceId = nextProductGeoPlaceId
					await tx
						.insert(ProductGeoPlace)
						.values({
							id: nextProductGeoPlaceId,
							productId: product.id,
							placeId: matchedPlaceId,
							role: "primary_discovery",
							isPrimary: true,
							source: "geo_backfill",
							createdAt: now,
							updatedAt: now,
						})
						.onConflictDoNothing()
				}

				await tx
					.insert(ProductGeoPlaceBackfill)
					.values({
						id: productBackfillId(product.id),
						productId: product.id,
						placeId: resolution.placeId,
						legacyDestinationMapId: destinationMapIds.get(product.destinationId) ?? null,
						resolutionStatus: resolution.resolutionStatus,
						matchMethod: resolution.matchMethod,
						confidence: resolution.confidence,
						distanceMeters: resolution.distanceMeters,
						evidenceJson: resolution.evidence,
						catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
						appliedProductGeoPlaceId,
						createdAt: now,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: ProductGeoPlaceBackfill.productId,
						set: {
							placeId: resolution.placeId,
							legacyDestinationMapId: destinationMapIds.get(product.destinationId) ?? null,
							resolutionStatus: resolution.resolutionStatus,
							matchMethod: resolution.matchMethod,
							confidence: resolution.confidence,
							distanceMeters: resolution.distanceMeters,
							evidenceJson: resolution.evidence,
							catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
							appliedProductGeoPlaceId,
							updatedAt: now,
						},
					})
			}
		})
	}

	console.log(
		JSON.stringify(
			{
				action: "bolivia_product_geography_backfill",
				mode: APPLY ? "applied" : "dry_run",
				catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
				destinations: destinationSummary,
				products: productSummary,
				deduplicatedLegacyDestinations,
				manualReviewRequired:
					(destinationSummary.review_required ?? 0) + (productSummary.review_required ?? 0),
			},
			null,
			2
		)
	)
}

run()
	.catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await closePostgresClients()
	})
