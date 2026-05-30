import {
	normalizeProductType,
	hotelSchema,
	tourSchema,
	packageSchema,
	limousineSchema,
} from "@/schemas/product/subtype"

function listFromForm(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean)
}

function objectFromFields(
	fields: Record<string, FormDataEntryValue | null>
): Record<string, string> | null {
	const entries = Object.entries(fields)
		.map(([key, value]) => [key, String(value ?? "").trim()] as const)
		.filter(([, value]) => value.length > 0)
	return entries.length ? Object.fromEntries(entries) : null
}

export async function createProductSubtype(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	subtypeExists: (
		productId: string,
		subtype: "hotel" | "tour" | "package" | "limousine"
	) => Promise<boolean>
	insertHotel: (data: any) => Promise<any>
	insertTour: (data: any) => Promise<any>
	insertPackage: (data: any) => Promise<any>
	insertLimousine: (data: any) => Promise<any>
	providerId: string
	form: FormData
}): Promise<Response> {
	const {
		ensureOwned,
		subtypeExists,
		insertHotel,
		insertTour,
		insertPackage,
		insertLimousine,
		providerId,
		form,
	} = params

	const productId = String(form.get("productId") || "").trim()
	if (!productId)
		return new Response(JSON.stringify({ error: "productId required" }), { status: 400 })

	// verificar propiedad del producto
	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Product not found or not owned by you" }), {
			status: 403,
		})
	}

	// Use DB productType as source of truth (normalize)
	const productType = normalizeProductType((product as any).productType)
	if (!["hotel", "tour", "package", "limousine"].includes(productType)) {
		return new Response(JSON.stringify({ error: "Invalid product type in DB" }), { status: 400 })
	}

	// prevenir duplicados
	const already = await subtypeExists(productId, productType as any)
	if (already) {
		return new Response(
			JSON.stringify({ error: "Subtype details already exist for this product" }),
			{
				status: 400,
			}
		)
	}

	// validar y crear según tipo
	if (productType === "hotel") {
		const payload = {
			productId,
			productType: "hotel",
			stars: form.get("stars"),
			phone: form.get("phone"),
			email: form.get("email"),
			website: form.get("website"),
		}
		const parsed = hotelSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}
		await insertHotel(parsed.data as any)
		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	}

	if (productType === "tour") {
		const payload = {
			productId,
			productType: "tour",
			duration: form.get("duration"),
			difficultyLevel: form.get("difficultyLevel"),
			meetingPointJson: objectFromFields({
				address: form.get("meetingPointAddress"),
				instructions: form.get("meetingPointInstructions"),
			}),
			itineraryJson: listFromForm(form.get("tourItinerary")).map((description, index) => ({
				step: index + 1,
				description,
			})),
			safetyJson: objectFromFields({
				requirements: form.get("safetyRequirements"),
				warnings: form.get("safetyWarnings"),
			}),
			guideJson: objectFromFields({
				languages: listFromForm(form.get("guideLanguages")).join(", "),
				guideType: form.get("guideType"),
			}),
		}
		const parsed = tourSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}
		await insertTour(parsed.data as any)
		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	}

	if (productType === "package") {
		const payload = {
			productId,
			productType: "package",
			days: form.get("days"),
			nights: form.get("nights"),
			itineraryJson: listFromForm(form.get("itinerary")).map((description, index) => ({
				day: index + 1,
				description,
			})),
			includesJson: listFromForm(form.get("includes")),
			excludesJson: listFromForm(form.get("excludes")),
		}
		const parsed = packageSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}
		await insertPackage(parsed.data as any)
		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	}

	const payload = {
		productId,
		productType: "limousine",
		vehicleProfileJson: objectFromFields({
			make: form.get("vehicleMake"),
			model: form.get("vehicleModel"),
			class: form.get("vehicleClass"),
			color: form.get("vehicleColor"),
		}),
		pickupJson: objectFromFields({
			defaultArea: form.get("pickupDefaultArea"),
			instructions: form.get("pickupInstructions"),
		}),
		dropoffJson: objectFromFields({
			defaultArea: form.get("dropoffDefaultArea"),
			instructions: form.get("dropoffInstructions"),
		}),
		passengerCapacity: form.get("passengerCapacity"),
		luggageCapacity: form.get("luggageCapacity"),
	}
	const parsed = limousineSchema.safeParse(payload)
	if (!parsed.success) {
		return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
	}
	await insertLimousine(parsed.data as any)
	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
