import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	BookingLineItem,
	db,
	DailyInventory,
	GeoPlace,
	EffectiveAvailability,
	EffectivePricing,
	and,
	eq,
	first,
	Hotel,
	MarketplaceCommercialCertificationRun,
	Product,
	ProductContent,
	ProductGeoPlace,
	ProductLocation,
	Provider,
	ProviderProfile,
	ProviderTaxConfiguration,
	ProviderUser,
	ProviderVerification,
	RatePlan,
	SearchUnitView,
	TaxFeeAssignment,
	TaxFeeDefinition,
	TaxFeeDefinitionVersion,
	Tour,
	TourSlotProfile,
	User,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
	lt,
} from "@/shared/infrastructure/db/compat"
import { typedAssignmentTarget } from "@/shared/domain/assignment-target"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import { getPublicDestinationListings } from "@/lib/marketplace/publicDestinationListings"
import { getPublicSearchSurface } from "@/lib/search/publicSearchSurface"
import { GET as receiptGet } from "@/pages/api/booking/[bookingId]/receipt"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { POST as holdPost } from "@/pages/api/inventory/hold"
import type { PriceQuote } from "@/modules/pricing/public"
import { prepareMarketplaceCertificationEnvironment } from "./marketplace-certification-environment"

const APPLY = process.argv.includes("--apply")
const CONFIRMED = process.env.CONFIRM_MARKETPLACE_COMMERCIAL_CERTIFICATION === "apply"
const SUITE_VERSION = "marketplace-commercial-v1"
const PROVIDER_ID = "prov_marketplace_certification"
const USER_ID = "user_marketplace_certification"
const GEO_PLACE_ID = "dest_marketplace_certification_la_paz"
const HOTEL_PRODUCT_ID = "prod_marketplace_certification_hotel_la_paz"
const TOUR_PRODUCT_ID = "prod_marketplace_certification_tour_la_paz"
const HOTEL_VARIANT_ID = "var_marketplace_certification_hotel_standard"
const TOUR_VARIANT_ID = "var_marketplace_certification_tour_morning"
const HOTEL_RATE_PLAN_ID = "rate_marketplace_certification_hotel_web"
const TOUR_RATE_PLAN_ID = "rate_marketplace_certification_tour_web"
const TAX_DEFINITION_ID = "tax_marketplace_certification_vat"
const TAX_VERSION_ID = "tax_version_marketplace_certification_v1"
const TAX_ASSIGNMENT_ID = "tax_assignment_marketplace_certification_provider_web"
const LA_PAZ_GEO_PLACE_ID = "geo:bo:la-paz-city"

type CommerceTerms = {
	quoteId: string
	currency: string
	baseAmount: number
	taxAmount: number
	feeAmount: number
	totalAmount: number
}

function addDays(days: number) {
	const date = new Date()
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function nextDate(date: string) {
	const value = new Date(`${date}T00:00:00.000Z`)
	value.setUTCDate(value.getUTCDate() + 1)
	return value.toISOString().slice(0, 10)
}

function commerceTerms(quote: PriceQuote): CommerceTerms {
	const lines = quote.taxesAndFees
	const taxAmount = [...lines.taxes.included, ...lines.taxes.excluded].reduce(
		(total, line) => total + Number(line.amount),
		0
	)
	const feeAmount = [...lines.fees.included, ...lines.fees.excluded].reduce(
		(total, line) => total + Number(line.amount),
		0
	)
	return {
		quoteId: quote.quoteId,
		currency: quote.currency,
		baseAmount: Number(quote.baseAmount),
		taxAmount: Number(taxAmount.toFixed(2)),
		feeAmount: Number(feeAmount.toFixed(2)),
		totalAmount: Number(quote.totalAmount),
	}
}

function assertSameTerms(reference: CommerceTerms, candidate: CommerceTerms, stage: string) {
	for (const key of Object.keys(reference) as Array<keyof CommerceTerms>) {
		if (reference[key] !== candidate[key]) {
			throw new Error(
				`CERTIFICATION_QUOTE_MISMATCH:${stage}:${key}:${String(reference[key])}:${String(candidate[key])}`
			)
		}
	}
}

function readJson(response: Response) {
	return response.text().then((text) => (text ? JSON.parse(text) : null))
}

function localQaEnvironment() {
	const previous = {
		LOCAL_QA_AUTH_ENABLED: process.env.LOCAL_QA_AUTH_ENABLED,
		LOCAL_QA_AUTH_USER_ID: process.env.LOCAL_QA_AUTH_USER_ID,
		LOCAL_QA_AUTH_EMAIL: process.env.LOCAL_QA_AUTH_EMAIL,
		TOURS_CHECKOUT_ENABLED: process.env.TOURS_CHECKOUT_ENABLED,
		TOURS_PUBLIC_SEARCH_ENABLED: process.env.TOURS_PUBLIC_SEARCH_ENABLED,
		TOURS_REFUND_HOURS_ENABLED: process.env.TOURS_REFUND_HOURS_ENABLED,
		TOURS_CHECKIN_ENABLED: process.env.TOURS_CHECKIN_ENABLED,
		TOURS_ROLLOUT_STAGE: process.env.TOURS_ROLLOUT_STAGE,
		TOURS_ROLLOUT_DEPLOYMENT_ENV: process.env.TOURS_ROLLOUT_DEPLOYMENT_ENV,
	}
	process.env.LOCAL_QA_AUTH_ENABLED = "true"
	process.env.LOCAL_QA_AUTH_USER_ID = USER_ID
	process.env.LOCAL_QA_AUTH_EMAIL = "marketplace-certification@fastt.local"
	process.env.TOURS_CHECKOUT_ENABLED = "true"
	process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
	process.env.TOURS_REFUND_HOURS_ENABLED = "true"
	process.env.TOURS_CHECKIN_ENABLED = "true"
	process.env.TOURS_ROLLOUT_STAGE = "staging"
	process.env.TOURS_ROLLOUT_DEPLOYMENT_ENV = "development"
	return () => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

async function upsertFixture(params: {
	hotelCheckIn: string
	hotelCheckOut: string
	tourCheckIn: string
}) {
	const now = new Date()
	const occupancyKey = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
	const hotelDates = [
		params.hotelCheckIn,
		nextDate(params.hotelCheckIn),
		nextDate(nextDate(params.hotelCheckIn)),
	]

	await db
		.insert(Provider)
		.values({
			id: PROVIDER_ID,
			legalName: "Fastt Marketplace Certification",
			displayName: "Fastt Certification",
			status: "active",
			accountPurpose: "commercial",
			dataClassification: "production",
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: Provider.id,
			set: {
				legalName: "Fastt Marketplace Certification",
				displayName: "Fastt Certification",
				status: "active",
				accountPurpose: "commercial",
				dataClassification: "production",
			},
		})
	await db
		.insert(User)
		.values({
			id: USER_ID,
			email: "marketplace-certification@fastt.local",
			firstName: "Marketplace",
			lastName: "Certification",
		})
		.onConflictDoNothing()
	await db
		.insert(ProviderUser)
		.values({
			id: "provider_user_marketplace_certification",
			providerId: PROVIDER_ID,
			userId: USER_ID,
			role: "owner",
			workspaceExperience: "professional",
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [ProviderUser.providerId, ProviderUser.userId],
			set: { role: "owner" },
		})
	await db
		.insert(ProviderProfile)
		.values({
			providerId: PROVIDER_ID,
			timezone: "America/La_Paz",
			defaultCurrency: "USD",
			supportEmail: "marketplace-certification@fastt.local",
			governanceUpdatedAt: now,
		})
		.onConflictDoUpdate({
			target: ProviderProfile.providerId,
			set: {
				timezone: "America/La_Paz",
				defaultCurrency: "USD",
				supportEmail: "marketplace-certification@fastt.local",
				governanceUpdatedAt: now,
			},
		})
	await db
		.insert(ProviderTaxConfiguration)
		.values({
			providerId: PROVIDER_ID,
			status: "verified",
			taxResidenceCountry: "BO",
			businessRegistrationNumber: "CERTIFICATION-ONLY",
			taxRegime: "certification",
			invoicingMode: "platform_receipt",
			updatedAt: now,
			updatedBy: USER_ID,
		})
		.onConflictDoUpdate({
			target: ProviderTaxConfiguration.providerId,
			set: {
				status: "verified",
				taxResidenceCountry: "BO",
				businessRegistrationNumber: "CERTIFICATION-ONLY",
				updatedAt: now,
				updatedBy: USER_ID,
			},
		})
	await db
		.insert(ProviderVerification)
		.values({
			id: "provider_verification_marketplace_certification",
			providerId: PROVIDER_ID,
			status: "approved",
			reason: "Controlled development commercialization certification",
			reviewedAt: now,
			reviewedBy: USER_ID,
			metadataJson: { suiteVersion: SUITE_VERSION },
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: ProviderVerification.id,
			set: { status: "approved", reviewedAt: now, reviewedBy: USER_ID },
		})

	await db
		.insert(GeoPlace)
		.values({
			id: GEO_PLACE_ID,
			canonicalName: "La Paz",
			normalizedName: "la paz",
			placeType: "locality",
			countryCode: "BO",
			centroidLat: -16.5,
			centroidLng: -68.15,
			slug: "marketplace-certification-la-paz",
			canonicalPath: "marketplace-certification-la-paz",
		})
		.onConflictDoUpdate({
			target: GeoPlace.id,
			set: {
				canonicalName: "La Paz",
				normalizedName: "la paz",
				countryCode: "BO",
				centroidLat: -16.5,
				centroidLng: -68.15,
				canonicalPath: "marketplace-certification-la-paz",
			},
		})

	for (const product of [
		{ id: HOTEL_PRODUCT_ID, name: "Alojamiento de certificación La Paz", type: "hotel" },
		{ id: TOUR_PRODUCT_ID, name: "Tour de certificación La Paz", type: "tour" },
	] as const) {
		await db
			.insert(Product)
			.values({
				id: product.id,
				name: product.name,
				productType: product.type,
				providerId: PROVIDER_ID,
				dataClass: "production",
				creationDate: now,
				lastUpdated: now,
			})
			.onConflictDoUpdate({
				target: Product.id,
				set: {
					name: product.name,
					productType: product.type,
					dataClass: "production",
					lastUpdated: now,
				},
			})
		await db
			.update(Product)
			.set({
				publicationState: "published",
				publicationValidationErrorsJson: null,
				publicationUpdatedAt: new Date(),
			})
			.where(eq(Product.id, product.id))
		await db
			.insert(ProductContent)
			.values({
				productId: product.id,
				description: "Inventario controlado para certificar el recorrido comercial de Fastt.",
				highlightsJson: ["Certificación de desarrollo"],
				seoJson: { noindex: true, certification: SUITE_VERSION },
				dataClass: "production",
			})
			.onConflictDoUpdate({
				target: ProductContent.productId,
				set: { dataClass: "production", seoJson: { noindex: true, certification: SUITE_VERSION } },
			})
		await db
			.insert(ProductLocation)
			.values({ productId: product.id, address: "La Paz, Bolivia", lat: -16.5, lng: -68.15 })
			.onConflictDoUpdate({
				target: ProductLocation.productId,
				set: { address: "La Paz, Bolivia", lat: -16.5, lng: -68.15 },
			})
		await db
			.insert(ProductGeoPlace)
			.values({
				id: `product_geo_${product.id}`,
				productId: product.id,
				placeId: LA_PAZ_GEO_PLACE_ID,
				role: "primary_discovery",
				isPrimary: true,
				source: "marketplace_certification",
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [ProductGeoPlace.productId, ProductGeoPlace.placeId, ProductGeoPlace.role],
				set: { isPrimary: true, source: "marketplace_certification", updatedAt: now },
			})
	}

	await db
		.insert(Hotel)
		.values({
			productId: HOTEL_PRODUCT_ID,
			stars: 4,
			email: "marketplace-certification@fastt.local",
		})
		.onConflictDoUpdate({ target: Hotel.productId, set: { stars: 4 } })
	await db
		.insert(Tour)
		.values({
			productId: TOUR_PRODUCT_ID,
			duration: "3 horas",
			durationMinutes: 180,
			difficultyLevel: "easy",
			meetingPointJson: {
				address: "Plaza Murillo, La Paz",
				instructions: "Fixture de certificación",
			},
			itineraryJson: ["Centro histórico"],
			includesJson: ["Guía"],
		})
		.onConflictDoUpdate({
			target: Tour.productId,
			set: { duration: "3 horas", durationMinutes: 180 },
		})

	const commercialUnits = [
		{
			variantId: HOTEL_VARIANT_ID,
			productId: HOTEL_PRODUCT_ID,
			ratePlanId: HOTEL_RATE_PLAN_ID,
			name: "Habitación certificación",
			kind: "hotel_room",
			capacity: 20,
			price: 120,
			dates: hotelDates,
		},
		{
			variantId: TOUR_VARIANT_ID,
			productId: TOUR_PRODUCT_ID,
			ratePlanId: TOUR_RATE_PLAN_ID,
			name: "Salida certificación 09:00",
			kind: "tour_slot",
			capacity: 20,
			price: 80,
			dates: [params.tourCheckIn],
		},
	] as const

	for (const unit of commercialUnits) {
		await db
			.insert(Variant)
			.values({
				id: unit.variantId,
				productId: unit.productId,
				name: unit.name,
				kind: unit.kind,
				lifecycleState: "ready",
				salesEnabled: true,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: Variant.id,
				set: { lifecycleState: "ready", salesEnabled: true },
			})
		await db
			.insert(VariantCapacity)
			.values({
				variantId: unit.variantId,
				minOccupancy: 1,
				maxOccupancy: unit.capacity,
				maxAdults: unit.capacity,
			})
			.onConflictDoUpdate({
				target: VariantCapacity.variantId,
				set: { minOccupancy: 1, maxOccupancy: unit.capacity, maxAdults: unit.capacity },
			})
		await db
			.insert(VariantInventoryConfig)
			.values({
				variantId: unit.variantId,
				defaultTotalUnits: unit.capacity,
				horizonDays: 365,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: VariantInventoryConfig.variantId,
				set: { defaultTotalUnits: unit.capacity, horizonDays: 365 },
			})
		await db
			.insert(RatePlan)
			.values({
				id: unit.ratePlanId,
				variantId: unit.variantId,
				name: "Web certificación",
				isDefault: true,
				isActive: true,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: RatePlan.id,
				set: { name: "Web certificación", isDefault: true, isActive: true },
			})
		for (const date of unit.dates) {
			await db
				.insert(DailyInventory)
				.values({
					id: `inventory_${unit.variantId}_${date}`,
					variantId: unit.variantId,
					date,
					totalInventory: unit.capacity,
					reservedCount: 0,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [DailyInventory.variantId, DailyInventory.date],
					set: { totalInventory: unit.capacity, updatedAt: now },
				})
			await db
				.insert(EffectiveAvailability)
				.values({
					id: `availability_${unit.variantId}_${date}`,
					variantId: unit.variantId,
					date,
					totalUnits: unit.capacity,
					heldUnits: 0,
					bookedUnits: 0,
					externalBlockedUnits: 0,
					availableUnits: unit.capacity,
					computedAt: now,
				})
				.onConflictDoUpdate({
					target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
					set: { totalUnits: unit.capacity, availableUnits: unit.capacity, computedAt: now },
				})
			await db
				.insert(EffectivePricing)
				.values({
					id: `pricing_${unit.variantId}_${date}`,
					variantId: unit.variantId,
					ratePlanId: unit.ratePlanId,
					date,
					occupancyKey,
					baseComponent: unit.price,
					occupancyAdjustment: 0,
					ruleAdjustment: 0,
					finalBasePrice: unit.price,
					currency: "USD",
					computedAt: now,
					sourceVersion: SUITE_VERSION,
				})
				.onConflictDoUpdate({
					target: [
						EffectivePricing.variantId,
						EffectivePricing.ratePlanId,
						EffectivePricing.date,
						EffectivePricing.occupancyKey,
					],
					set: { finalBasePrice: unit.price, computedAt: now, sourceVersion: SUITE_VERSION },
				})
			await db
				.insert(SearchUnitView)
				.values({
					id: `search_${unit.variantId}_${date}`,
					variantId: unit.variantId,
					productId: unit.productId,
					ratePlanId: unit.ratePlanId,
					date,
					occupancyKey,
					totalGuests: 2,
					hasAvailability: true,
					hasPrice: true,
					isAvailable: true,
					availableUnits: unit.capacity,
					pricePerNight: unit.price,
					currency: "USD",
					primaryBlocker: null,
					minStay: 1,
					maxStay: null,
					minLeadTime: null,
					maxLeadTime: null,
					cta: false,
					ctd: false,
					computedAt: now,
					sourceVersion: SUITE_VERSION,
				})
				.onConflictDoUpdate({
					target: [
						SearchUnitView.variantId,
						SearchUnitView.ratePlanId,
						SearchUnitView.date,
						SearchUnitView.occupancyKey,
					],
					set: {
						hasAvailability: true,
						hasPrice: true,
						isAvailable: true,
						availableUnits: unit.capacity,
						pricePerNight: unit.price,
						primaryBlocker: null,
						computedAt: now,
						sourceVersion: SUITE_VERSION,
					},
				})
		}
	}

	await db
		.insert(TourSlotProfile)
		.values({
			variantId: TOUR_VARIANT_ID,
			departureTime: "09:00",
			maxPax: 20,
			languageCode: "es",
			bookingMode: "shared",
			isActive: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: TourSlotProfile.variantId,
			set: { departureTime: "09:00", maxPax: 20, isActive: true, updatedAt: now },
		})

	const taxSnapshot = {
		code: "VAT_CERTIFICATION_10",
		value: 10,
		jurisdiction: "BO",
		suiteVersion: SUITE_VERSION,
	}
	await db
		.insert(TaxFeeDefinition)
		.values({
			id: TAX_DEFINITION_ID,
			providerId: PROVIDER_ID,
			code: "VAT_CERTIFICATION_10",
			name: "IVA certificación 10%",
			kind: "tax",
			calculationType: "percentage",
			value: 10,
			currency: null,
			inclusionType: "excluded",
			appliesPer: "stay",
			priority: 0,
			jurisdictionJson: {
				country: "BO",
				collectionResponsibility: "provider",
				taxableBase: "booking_base",
			},
			effectiveFrom: null,
			effectiveTo: null,
			status: "archived",
			editingState: "draft",
			currentVersionId: null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: TaxFeeDefinition.id,
			set: {
				value: 10,
				status: "archived",
				editingState: "draft",
				currentVersionId: null,
				jurisdictionJson: {
					country: "BO",
					collectionResponsibility: "provider",
					taxableBase: "booking_base",
				},
				updatedAt: now,
			},
		})
	await db
		.insert(TaxFeeDefinitionVersion)
		.values({
			id: TAX_VERSION_ID,
			taxFeeDefinitionId: TAX_DEFINITION_ID,
			version: 1,
			publicationState: "published",
			snapshotJson: taxSnapshot,
			createdByUserId: USER_ID,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [TaxFeeDefinitionVersion.taxFeeDefinitionId, TaxFeeDefinitionVersion.version],
			set: { publicationState: "published", snapshotJson: taxSnapshot, createdByUserId: USER_ID },
		})
	await db
		.update(TaxFeeDefinition)
		.set({
			currentVersionId: TAX_VERSION_ID,
			editingState: "published",
			status: "active",
			updatedAt: now,
		})
		.where(eq(TaxFeeDefinition.id, TAX_DEFINITION_ID))
	await db
		.insert(TaxFeeAssignment)
		.values({
			id: TAX_ASSIGNMENT_ID,
			taxFeeDefinitionId: TAX_DEFINITION_ID,
			scope: "provider",
			...typedAssignmentTarget("provider", PROVIDER_ID),
			channel: "web",
			status: "active",
			effectiveFrom: null,
			effectiveTo: null,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: TaxFeeAssignment.id,
			set: { status: "active", channel: "web", effectiveFrom: null, effectiveTo: null },
		})
}

async function certifyFlow(input: {
	label: "hotel" | "tour"
	productId: string
	ratePlanId: string
	variantId: string
	checkIn: string
	checkOut: string
	rooms: number
}) {
	const vertical = input.label === "hotel" ? "alojamientos" : "tours"
	const landing = await getPublicDestinationListings({
		path: "bolivia/la-paz-department/la-paz",
		vertical,
		limit: 100,
	})
	if (!landing.listings.some((listing) => listing.id === input.productId)) {
		throw new Error(`CERTIFICATION_LANDING_MISSING:${input.label}`)
	}
	const destination = await getPublicDestinationListings({
		path: "bolivia/la-paz-department/la-paz",
		vertical,
		limit: 100,
	})
	if (
		!destination.destination ||
		!destination.listings.some((listing) => listing.id === input.productId)
	) {
		throw new Error(`CERTIFICATION_DESTINATION_MISSING:${input.label}`)
	}

	const search = await getPublicSearchSurface({
		geoPlaceId: LA_PAZ_GEO_PLACE_ID,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		rooms: input.rooms,
		adults: 2,
		children: 0,
		currency: "USD",
	})
	const searchResult = search.results.find((result) => result.productId === input.productId)
	if (!searchResult) throw new Error(`CERTIFICATION_SEARCH_MISSING:${input.label}`)
	const searchTerms = commerceTerms(searchResult.priceQuote)

	const holdResponse = await holdPost({
		request: new Request("http://localhost:4321/api/inventory/hold", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				variantId: input.variantId,
				ratePlanId: input.ratePlanId,
				dateRange: { from: input.checkIn, to: input.checkOut },
				rooms: input.rooms,
				occupancyDetail: { adults: 2, children: 0, infants: 0 },
				sessionId: `marketplace-certification-${input.label}-${crypto.randomUUID()}`,
				quoteId: searchTerms.quoteId,
			}),
		}),
	} as any)
	const holdPayload = await readJson(holdResponse)
	if (holdResponse.status !== 200 || !holdPayload?.priceQuote) {
		throw new Error(`CERTIFICATION_HOLD_FAILED:${input.label}:${JSON.stringify(holdPayload)}`)
	}
	const holdTerms = commerceTerms(holdPayload.priceQuote as PriceQuote)
	assertSameTerms(searchTerms, holdTerms, `${input.label}:hold`)

	const checkoutResponse = await bookingConfirmPost({
		request: new Request("http://localhost:4321/api/booking/confirm", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ holdId: holdPayload.holdId, priceQuoteId: searchTerms.quoteId }),
		}),
	} as any)
	const checkoutPayload = await readJson(checkoutResponse)
	if (checkoutResponse.status !== 200 || !checkoutPayload?.bookingId) {
		throw new Error(
			`CERTIFICATION_CHECKOUT_FAILED:${input.label}:${JSON.stringify(checkoutPayload)}`
		)
	}
	if (checkoutPayload.priceQuoteId !== searchTerms.quoteId) {
		throw new Error(`CERTIFICATION_QUOTE_MISMATCH:${input.label}:checkout:quoteId`)
	}

	const booking = await db
		.select({ pricingBreakdownJson: BookingLineItem.pricingBreakdownJson })
		.from(BookingLineItem)
		.where(eq(BookingLineItem.bookingId, checkoutPayload.bookingId))
		.then(first)
	const bookingQuote = (booking?.pricingBreakdownJson as { priceQuote?: PriceQuote } | null)
		?.priceQuote
	if (!bookingQuote) throw new Error(`CERTIFICATION_BOOKING_QUOTE_MISSING:${input.label}`)
	const bookingTerms = commerceTerms(bookingQuote)
	assertSameTerms(searchTerms, bookingTerms, `${input.label}:booking`)

	const receiptResponse = await receiptGet({
		params: { bookingId: checkoutPayload.bookingId },
		request: new Request(`http://localhost:4321/api/booking/${checkoutPayload.bookingId}/receipt`),
	} as any)
	const receipt = await readJson(receiptResponse)
	if (receiptResponse.status !== 200) throw new Error(`CERTIFICATION_RECEIPT_FAILED:${input.label}`)
	const receiptTerms: CommerceTerms = {
		quoteId: receipt.priceQuoteId,
		currency: receipt.currency,
		baseAmount: Number(receipt.baseAmount),
		taxAmount: Number(
			[...receipt.included, ...receipt.added]
				.filter((line: { kind: string }) => line.kind === "tax")
				.reduce((sum: number, line: { amount: number }) => sum + Number(line.amount), 0)
				.toFixed(2)
		),
		feeAmount: Number(
			[...receipt.included, ...receipt.added]
				.filter((line: { kind: string }) => line.kind === "fee")
				.reduce((sum: number, line: { amount: number }) => sum + Number(line.amount), 0)
				.toFixed(2)
		),
		totalAmount: Number(receipt.totalAmount),
	}
	assertSameTerms(searchTerms, receiptTerms, `${input.label}:receipt`)

	return {
		landing: { productId: input.productId, listingCount: landing.listings.length },
		destination: { slug: destination.destination.slug, listingCount: destination.listings.length },
		search: searchTerms,
		hold: holdTerms,
		checkout: { bookingId: checkoutPayload.bookingId, quoteId: checkoutPayload.priceQuoteId },
		booking: bookingTerms,
		receipt: receiptTerms,
	}
}

async function run() {
	prepareMarketplaceCertificationEnvironment({ apply: APPLY, confirmed: CONFIRMED })
	const hotelCheckIn = addDays(21)
	const hotelCheckOut = addDays(24)
	const tourCheckIn = addDays(28)
	const tourCheckOut = nextDate(tourCheckIn)
	if (!APPLY) {
		console.log(
			JSON.stringify(
				{
					action: "marketplace_commercial_certification",
					mode: "dry_run",
					suiteVersion: SUITE_VERSION,
					hotelCheckIn,
					hotelCheckOut,
					tourCheckIn,
					tourCheckOut,
				},
				null,
				2
			)
		)
		return
	}

	const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
	await db
		.update(MarketplaceCommercialCertificationRun)
		.set({
			status: "failed",
			failureJson: { message: "CERTIFICATION_RUN_ABANDONED" },
			completedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(MarketplaceCommercialCertificationRun.status, "running"),
				lt(MarketplaceCommercialCertificationRun.startedAt, staleBefore)
			)
		)

	const runId = crypto.randomUUID()
	const startedAt = new Date()
	await upsertFixture({ hotelCheckIn, hotelCheckOut, tourCheckIn })
	await db.insert(MarketplaceCommercialCertificationRun).values({
		id: runId,
		suiteVersion: SUITE_VERSION,
		status: "running",
		providerId: PROVIDER_ID,
		hotelProductId: HOTEL_PRODUCT_ID,
		tourProductId: TOUR_PRODUCT_ID,
		checkIn: hotelCheckIn,
		checkOut: hotelCheckOut,
		evidenceJson: { stage: "fixture_prepared" },
		startedAt,
		createdAt: startedAt,
		updatedAt: startedAt,
	})
	const restoreEnvironment = localQaEnvironment()
	try {
		const hotel = await certifyFlow({
			label: "hotel",
			productId: HOTEL_PRODUCT_ID,
			variantId: HOTEL_VARIANT_ID,
			ratePlanId: HOTEL_RATE_PLAN_ID,
			checkIn: hotelCheckIn,
			checkOut: hotelCheckOut,
			rooms: 1,
		})
		await db
			.update(MarketplaceCommercialCertificationRun)
			.set({ evidenceJson: { stage: "hotel_passed", hotel }, updatedAt: new Date() })
			.where(eq(MarketplaceCommercialCertificationRun.id, runId))
		const tour = await certifyFlow({
			label: "tour",
			productId: TOUR_PRODUCT_ID,
			variantId: TOUR_VARIANT_ID,
			ratePlanId: TOUR_RATE_PLAN_ID,
			checkIn: tourCheckIn,
			checkOut: tourCheckOut,
			rooms: 2,
		})
		const evidence = { suiteVersion: SUITE_VERSION, providerId: PROVIDER_ID, hotel, tour }
		await db
			.update(MarketplaceCommercialCertificationRun)
			.set({
				status: "passed",
				evidenceJson: evidence,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(MarketplaceCommercialCertificationRun.id, runId))
		console.log(
			JSON.stringify(
				{
					action: "marketplace_commercial_certification",
					mode: "applied",
					status: "passed",
					runId,
					evidence,
				},
				null,
				2
			)
		)
	} catch (error) {
		const failure = { message: error instanceof Error ? error.message : String(error) }
		await db
			.update(MarketplaceCommercialCertificationRun)
			.set({
				status: "failed",
				failureJson: failure,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(MarketplaceCommercialCertificationRun.id, runId))
		throw error
	} finally {
		restoreEnvironment()
	}
}

run()
	.catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await closePostgresClients()
	})
