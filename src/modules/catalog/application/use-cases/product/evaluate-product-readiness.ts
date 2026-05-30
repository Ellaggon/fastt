import type { ProductRepositoryPort, ProductStatusState } from "../../ports/ProductRepositoryPort"
import { normalizeProductVertical } from "@/lib/productVerticalRegistry"

type ValidationError = { code: string; message: string }

export async function evaluateProductReadiness(
	deps: { repo: ProductRepositoryPort },
	params: { productId: string }
): Promise<{
	productId: string
	state: ProductStatusState
	validationErrors: ValidationError[]
}> {
	const agg = await deps.repo.getProductAggregate(params.productId)
	if (!agg) throw new Error("Product not found")

	const errors: ValidationError[] = []

	// Identity checks (minimal): must have name/productType already, but keep it defensive.
	if (!agg.product.name || String(agg.product.name).trim().length < 1) {
		errors.push({ code: "missing_name", message: "Product name is required" })
	}
	if (!agg.product.productType || String(agg.product.productType).trim().length < 1) {
		errors.push({ code: "missing_product_type", message: "Product type is required" })
	}

	// Content checks
	const highlights = (agg.content?.highlightsJson as unknown) ?? null
	if (!Array.isArray(highlights) || highlights.length < 1) {
		errors.push({ code: "missing_content", message: "At least one highlight is required" })
	}

	// Location checks
	const lat = agg.location?.lat ?? null
	const lng = agg.location?.lng ?? null
	if (typeof lat !== "number" || typeof lng !== "number") {
		errors.push({ code: "missing_location", message: "Location coordinates are required" })
	}

	// Images checks
	if (!agg.imagesCount || agg.imagesCount < 1) {
		errors.push({ code: "missing_images", message: "At least one image is required" })
	}

	// Subtype checks
	if (!agg.subtypeExists) {
		errors.push({ code: "missing_subtype", message: "Subtype details are required" })
	}

	const vertical = normalizeProductVertical(agg.product.productType)
	const verticalReadiness = agg.verticalReadiness

	if (vertical === "hotel") {
		const room = verticalReadiness?.hotel
		if (!room || room.variantCount < 1) {
			errors.push({
				code: "missing_hotel_rooms",
				message: "At least one room must be created before publishing",
			})
		} else if (room.completeRoomCount < room.variantCount) {
			errors.push({
				code: "incomplete_hotel_rooms",
				message: "All hotel rooms must have profile, capacity and bed setup",
			})
		}
	}

	if (vertical === "tour") {
		const tour = verticalReadiness?.tour
		if (!tour?.hasItinerary) {
			errors.push({ code: "missing_tour_itinerary", message: "Tour itinerary is required" })
		}
		if (!tour?.hasMeetingPoint) {
			errors.push({ code: "missing_tour_meeting_point", message: "Tour meeting point is required" })
		}
		if (!tour?.hasSchedule) {
			errors.push({ code: "missing_tour_schedule", message: "Tour schedule is required" })
		}
	}

	if (vertical === "package") {
		const pkg = verticalReadiness?.package
		if (!pkg?.hasDaysAndNights) {
			errors.push({
				code: "missing_package_duration",
				message: "Package days and nights are required",
			})
		}
		if (!pkg?.hasItinerary) {
			errors.push({ code: "missing_package_itinerary", message: "Package itinerary is required" })
		}
		if (!pkg?.hasInclusions) {
			errors.push({
				code: "missing_package_inclusions",
				message: "Package inclusions are required",
			})
		}
	}

	if (vertical === "limousine") {
		const limo = verticalReadiness?.limousine
		if (!limo?.hasVehicle) {
			errors.push({ code: "missing_limousine_vehicle", message: "Vehicle profile is required" })
		}
		if (!limo?.hasPickupDropoff) {
			errors.push({
				code: "missing_limousine_pickup_dropoff",
				message: "Pickup and dropoff model is required",
			})
		}
		if (!limo?.hasCapacity) {
			errors.push({
				code: "missing_limousine_capacity",
				message: "Passenger and luggage capacity are required",
			})
		}
	}

	const state: ProductStatusState = errors.length === 0 ? "ready" : "draft"

	await deps.repo.upsertProductStatus({
		productId: params.productId,
		state,
		validationErrorsJson: errors.length === 0 ? null : errors,
	})

	return { productId: params.productId, state, validationErrors: errors }
}
