import {
	db,
	Destination,
	Product,
	Variant,
	VariantCapacity,
	RatePlanTemplate,
	RatePlan,
	PriceRule,
	eq,
	and,
} from "astro:db"

export async function upsertDestination(row: {
	id: string
	name: string
	type: string
	country: string
	slug: string
}) {
	await db
		.insert(Destination)
		.values(row)
		.onConflictDoUpdate({
			target: [Destination.id],
			set: {
				name: row.name,
				type: row.type,
				country: row.country,
				slug: row.slug,
			},
		})
}

export async function upsertProduct(row: {
	id: string
	name: string
	productType: string
	destinationId: string
	providerId?: string | null
}) {
	await db
		.insert(Product)
		.values({
			id: row.id,
			name: row.name,
			productType: row.productType,
			destinationId: row.destinationId,
			providerId: row.providerId ?? null,
		})
		.onConflictDoUpdate({
			target: [Product.id],
			set: {
				name: row.name,
				productType: row.productType,
				destinationId: row.destinationId,
				providerId: row.providerId ?? null,
				lastUpdated: new Date(),
			},
		})
}

export async function upsertVariant(row: {
	id: string
	productId: string
	kind?: "hotel_room" | "tour_slot" | "package_base"
	name: string
	description?: string | null
	baseRateCurrency?: string
	baseRatePrice?: number | null
	// Legacy aliases kept only for test fixture compatibility.
	currency?: string
	basePrice?: number | null
	isActive?: boolean
	minOccupancy?: number
	maxOccupancy?: number
}) {
	await db
		.insert(Variant)
		.values({
			id: row.id,
			productId: row.productId,
			kind: row.kind ?? "hotel_room",
			name: row.name,
			description: row.description ?? null,
			isActive: row.isActive ?? true,
		})
		.onConflictDoUpdate({
			target: [Variant.id],
			set: {
				productId: row.productId,
				kind: row.kind ?? "hotel_room",
				name: row.name,
				description: row.description ?? null,
				isActive: row.isActive ?? true,
			},
		})

	const baseRateCurrency = row.baseRateCurrency ?? row.currency ?? "USD"
	const baseRatePrice =
		row.baseRatePrice != null
			? Number(row.baseRatePrice)
			: row.basePrice != null
				? Number(row.basePrice)
				: null
	if (baseRatePrice != null && Number.isFinite(baseRatePrice)) {
		const defaultPlans = await db
			.select({ id: RatePlan.id })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, row.id),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
		for (const plan of defaultPlans.filter(Boolean)) {
			await db
				.insert(RatePlanOccupancyPolicy)
				.values({
					id: `rpop_${String(plan.id)}_a2c0`,
					ratePlanId: String(plan.id),
					baseAmount: baseRatePrice,
					baseCurrency: baseRateCurrency,
					baseAdults: 2,
					baseChildren: 0,
					extraAdultMode: "fixed",
					extraAdultValue: 0,
					childMode: "fixed",
					childValue: 0,
					currency: baseRateCurrency,
					effectiveFrom: "2020-01-01",
					effectiveTo: "2100-12-31",
					createdAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [RatePlanOccupancyPolicy.id],
					set: {
						baseAmount: baseRatePrice,
						baseCurrency: baseRateCurrency,
						currency: baseRateCurrency,
						createdAt: new Date(),
					},
				})
		}
	}

	const minOcc = row.minOccupancy ?? 1
	const maxOcc = row.maxOccupancy ?? Math.max(minOcc, 2)

	await db
		.insert(VariantCapacity)
		.values({
			variantId: row.id,
			minOccupancy: minOcc,
			maxOccupancy: maxOcc,
		})
		.onConflictDoUpdate({
			target: [VariantCapacity.variantId],
			set: {
				minOccupancy: minOcc,
				maxOccupancy: maxOcc,
			},
		})
}

export async function seedTestProductVariant(params?: {
	destinationId?: string
	productId?: string
	variantId?: string
	basePrice?: number
}) {
	const destinationId = params?.destinationId ?? "dest_test"
	const productId = params?.productId ?? "prod_test"
	const variantId = params?.variantId ?? "variant_test"

	await upsertDestination({
		id: destinationId,
		name: "Test Destination",
		type: "city",
		country: "CL",
		slug: "test-destination",
	})

	await upsertProduct({
		id: productId,
		name: "Test Product",
		productType: "hotel",
		destinationId,
	})

	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "Test Variant",
		baseRateCurrency: "USD",
		baseRatePrice: params?.basePrice ?? 100,
		isActive: true,
	})

	return { destinationId, productId, variantId }
}

export async function upsertRatePlanTemplate(row: {
	id: string
	name: string
	description?: string | null
	paymentType: string
	refundable: boolean
}) {
	await db
		.insert(RatePlanTemplate)
		.values({
			id: row.id,
			name: row.name,
			description: row.description ?? null,
			paymentType: row.paymentType,
			refundable: row.refundable,
			createdAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [RatePlanTemplate.id],
			set: {
				name: row.name,
				description: row.description ?? null,
				paymentType: row.paymentType,
				refundable: row.refundable,
			},
		})
}

export async function upsertRatePlan(row: {
	id: string
	templateId: string
	variantId: string
	isActive: boolean
	isDefault?: boolean
}) {
	await db
		.insert(RatePlan)
		.values({
			id: row.id,
			templateId: row.templateId,
			variantId: row.variantId,
			isDefault: row.isDefault ?? false,
			isActive: row.isActive,
			createdAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [RatePlan.id],
			set: {
				templateId: row.templateId,
				variantId: row.variantId,
				isDefault: row.isDefault ?? false,
				isActive: row.isActive,
			},
		})
}

export async function upsertPriceRule(row: {
	id: string
	ratePlanId: string
	type: string
	value: number
	priority?: number
	isActive?: boolean
	name?: string | null
	createdAt?: Date
}) {
	await db
		.insert(PriceRule)
		.values({
			id: row.id,
			ratePlanId: row.ratePlanId,
			name: row.name ?? null,
			type: row.type,
			value: row.value,
			priority: row.priority ?? 10,
			isActive: row.isActive ?? true,
			createdAt: row.createdAt ?? new Date(),
		})
		.onConflictDoUpdate({
			target: [PriceRule.id],
			set: {
				ratePlanId: row.ratePlanId,
				name: row.name ?? null,
				type: row.type,
				value: row.value,
				priority: row.priority ?? 10,
				isActive: row.isActive ?? true,
				createdAt: row.createdAt ?? new Date(),
			},
		})
}

export async function seedTestRatePlan(params: {
	variantId: string
	templateId?: string
	ratePlanId?: string
	priceRuleId?: string
}) {
	const templateId = params.templateId ?? "rpt_test"
	const ratePlanId = params.ratePlanId ?? "rp_test"
	const priceRuleId = params.priceRuleId ?? "prule_test"

	await upsertRatePlanTemplate({
		id: templateId,
		name: "Test Rate Plan",
		paymentType: "prepaid",
		refundable: false,
	})

	await upsertRatePlan({
		id: ratePlanId,
		templateId,
		variantId: params.variantId,
		isActive: true,
	})

	await upsertPriceRule({
		id: priceRuleId,
		ratePlanId,
		type: "percentage_discount",
		value: 10,
		isActive: true,
	})

	return { templateId, ratePlanId, priceRuleId }
}
