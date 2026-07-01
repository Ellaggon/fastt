import {
	Booking,
	BookingRoomDetail,
	BookingTaxFee,
	CommissionSnapshot,
	db,
	Destination,
	FinancialExceptionRecord,
	FinancialReviewEvent,
	FinancialSettlementRecord,
	PaymentTransaction,
	Product,
	Provider,
	ProviderFinancialProfile,
	ProviderPayableSnapshot,
	ProviderStatement,
	ProviderUser,
	RatePlan,
	RatePlanOccupancyPolicy,
	ReconciliationMatch,
	RefundHandoffRecord,
	User,
	Variant,
	eq,
} from "astro:db"

const QA_EMAIL = "ellaggon@gmail.com"
const QA_PROVIDER_ID = "qa-financial-provider-ellaggon"
let providerId = "qa-financial-provider-ellaggon"
const PRODUCT_ID = "qa-financial-hotel-sol"
const VARIANT_ID = "qa-financial-suite-norte"
const RATE_PLAN_ID = "qa-financial-plan-flexible"
const DESTINATION_ID = "qa-financial-santa-cruz"
const NOW = new Date("2026-06-30T12:00:00.000Z")

type DemoBooking = {
	id: string
	guestName: string
	checkIn: string
	checkOut: string
	amount: number
	tax: number
}

const bookings: DemoBooking[] = [
	{
		id: "1045",
		guestName: "Mariana Rojas",
		checkIn: "2026-07-12",
		checkOut: "2026-07-15",
		amount: 320,
		tax: 38.4,
	},
	{
		id: "1046",
		guestName: "Luis Mercado",
		checkIn: "2026-07-16",
		checkOut: "2026-07-18",
		amount: 280,
		tax: 33.6,
	},
	{
		id: "1047",
		guestName: "Camila Suárez",
		checkIn: "2026-07-20",
		checkOut: "2026-07-22",
		amount: 410,
		tax: 49.2,
	},
	{
		id: "1048",
		guestName: "Diego Salvatierra",
		checkIn: "2026-07-24",
		checkOut: "2026-07-26",
		amount: 500,
		tax: 60,
	},
	{
		id: "1049",
		guestName: "Paola Méndez",
		checkIn: "2026-07-28",
		checkOut: "2026-07-30",
		amount: 360,
		tax: 43.2,
	},
	{
		id: "1050",
		guestName: "Sofía Arce",
		checkIn: "2026-08-01",
		checkOut: "2026-08-03",
		amount: 440,
		tax: 52.8,
	},
	{
		id: "1051",
		guestName: "Nicolás Vargas",
		checkIn: "2026-08-05",
		checkOut: "2026-08-07",
		amount: 300,
		tax: 36,
	},
]

function daysAgo(days: number): Date {
	return new Date(NOW.getTime() - days * 86_400_000)
}

function commissionAmount(amount: number): number {
	return Number((amount * 0.15).toFixed(2))
}

async function ensureUser(email: string): Promise<string> {
	const normalizedEmail = email.trim().toLowerCase()
	const existing = await db
		.select({ id: User.id })
		.from(User)
		.where(eq(User.email, normalizedEmail))
		.get()
	if (existing?.id) return String(existing.id)

	const userId = `qa-user-${normalizedEmail.replace(/[^a-z0-9]+/g, "-")}`
	await db
		.insert(User)
		.values({
			id: userId,
			email: normalizedEmail,
			username: normalizedEmail,
			firstName: "Ellaggon",
			lastName: "QA",
		})
		.onConflictDoNothing()
	return userId
}

async function resolveProviderIdForUser(userId: string): Promise<string> {
	const existingLink = await db
		.select({ providerId: ProviderUser.providerId })
		.from(ProviderUser)
		.where(eq(ProviderUser.userId, userId))
		.get()
	const existingProviderId = String(existingLink?.providerId ?? "").trim()
	return existingProviderId || providerId
}

async function seedCatalog(userId: string): Promise<void> {
	if (providerId !== QA_PROVIDER_ID) {
		await db
			.delete(ProviderUser)
			.where(eq(ProviderUser.id, `qa-provider-user-${userId}-${QA_PROVIDER_ID}`))
	}

	const existingProvider = await db
		.select({ id: Provider.id })
		.from(Provider)
		.where(eq(Provider.id, providerId))
		.get()
	if (!existingProvider?.id) {
		await db
			.insert(Provider)
			.values({
				id: providerId,
				legalName: "Fastt Demo S.R.L.",
				displayName: "Hotel Sol",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing()
	}

	await db
		.insert(ProviderUser)
		.values({
			id: `qa-provider-user-${userId}-${providerId}`,
			providerId,
			userId,
			role: "owner",
			createdAt: NOW,
		})
		.onConflictDoNothing()

	await db
		.insert(Destination)
		.values({
			id: DESTINATION_ID,
			name: "Santa Cruz de la Sierra",
			type: "city",
			country: "bolivia",
			department: "santa-cruz",
			slug: "santa-cruz-de-la-sierra",
		})
		.onConflictDoUpdate({
			target: [Destination.id],
			set: {
				name: "Santa Cruz de la Sierra",
				type: "city",
				country: "bolivia",
				department: "santa-cruz",
				slug: "santa-cruz-de-la-sierra",
			},
		})

	await db
		.insert(Product)
		.values({
			id: PRODUCT_ID,
			name: "Hotel Sol",
			productType: "hotel",
			providerId,
			destinationId: DESTINATION_ID,
			creationDate: NOW,
			lastUpdated: NOW,
		})
		.onConflictDoUpdate({
			target: [Product.id],
			set: {
				name: "Hotel Sol",
				productType: "hotel",
				providerId,
				destinationId: DESTINATION_ID,
				lastUpdated: NOW,
			},
		})

	await db
		.insert(Variant)
		.values({
			id: VARIANT_ID,
			productId: PRODUCT_ID,
			name: "Suite Norte",
			description: "Suite demo para QA operacional de finanzas.",
			kind: "hotel_room",
			status: "sellable",
			createdAt: NOW,
			confirmationType: "instant",
			isActive: true,
		})
		.onConflictDoUpdate({
			target: [Variant.id],
			set: {
				productId: PRODUCT_ID,
				name: "Suite Norte",
				description: "Suite demo para QA operacional de finanzas.",
				kind: "hotel_room",
				status: "sellable",
				confirmationType: "instant",
				isActive: true,
			},
		})

	await db
		.insert(RatePlan)
		.values({
			id: RATE_PLAN_ID,
			variantId: VARIANT_ID,
			name: "Plan flexible",
			description: "Plan demo para validación visual financiera.",
			isDefault: true,
			isActive: true,
			createdAt: NOW,
		})
		.onConflictDoUpdate({
			target: [RatePlan.id],
			set: {
				variantId: VARIANT_ID,
				name: "Plan flexible",
				description: "Plan demo para validación visual financiera.",
				isDefault: true,
				isActive: true,
			},
		})

	await db
		.insert(RatePlanOccupancyPolicy)
		.values({
			id: `qa-rpop-${RATE_PLAN_ID}`,
			ratePlanId: RATE_PLAN_ID,
			baseAmount: 320,
			baseCurrency: "USD",
			baseAdults: 2,
			baseChildren: 0,
			extraAdultMode: "fixed",
			extraAdultValue: 0,
			childMode: "fixed",
			childValue: 0,
			currency: "USD",
			effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
			effectiveTo: new Date("2100-12-31T00:00:00.000Z"),
			createdAt: NOW,
		})
		.onConflictDoUpdate({
			target: [RatePlanOccupancyPolicy.id],
			set: {
				baseAmount: 320,
				baseCurrency: "USD",
				currency: "USD",
			},
		})
}

async function seedBookings(): Promise<void> {
	for (const booking of bookings) {
		await db
			.insert(Booking)
			.values({
				id: booking.id,
				providerId,
				ratePlanId: RATE_PLAN_ID,
				bookingDate: daysAgo(18),
				checkInDate: booking.checkIn,
				checkOutDate: booking.checkOut,
				numAdults: 2,
				numChildren: 0,
				totalAmount: booking.amount,
				status: "confirmed",
				operationalStatus: "pending_arrival",
				currency: "USD",
				source: "demo_qa",
				confirmedAt: daysAgo(12),
				guestEmailSnapshot: `${booking.guestName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
				guestNameSnapshot: booking.guestName,
				guestContactSnapshotJson: {
					name: booking.guestName,
					source: "financial_operational_demo_seed",
				},
				contractSnapshotVersion: "qa-financial-v1",
			})
			.onConflictDoUpdate({
				target: [Booking.id],
				set: {
					providerId,
					ratePlanId: RATE_PLAN_ID,
					checkInDate: booking.checkIn,
					checkOutDate: booking.checkOut,
					totalAmount: booking.amount,
					status: "confirmed",
					operationalStatus: "pending_arrival",
					currency: "USD",
					source: "demo_qa",
					confirmedAt: daysAgo(12),
					guestNameSnapshot: booking.guestName,
					contractSnapshotVersion: "qa-financial-v1",
				},
			})

		await db
			.insert(BookingRoomDetail)
			.values({
				id: `detail-${booking.id}`,
				bookingId: booking.id,
				variantId: VARIANT_ID,
				ratePlanId: RATE_PLAN_ID,
				checkIn: booking.checkIn,
				checkOut: booking.checkOut,
				adults: 2,
				children: 0,
				subtotalAmount: Number((booking.amount - booking.tax).toFixed(2)),
				taxAmount: booking.tax,
				totalAmount: booking.amount,
				pricingBreakdownJson: {
					source: "financial_operational_demo_seed",
					visibilityOnly: true,
				},
				providerIdSnapshot: providerId,
				productIdSnapshot: PRODUCT_ID,
				productNameSnapshot: "Hotel Sol",
				variantNameSnapshot: "Suite Norte",
				ratePlanNameSnapshot: "Plan flexible",
				occupancySnapshotJson: { adults: 2, children: 0 },
				createdAt: NOW,
			})
			.onConflictDoUpdate({
				target: [BookingRoomDetail.id],
				set: {
					bookingId: booking.id,
					variantId: VARIANT_ID,
					ratePlanId: RATE_PLAN_ID,
					checkIn: booking.checkIn,
					checkOut: booking.checkOut,
					subtotalAmount: Number((booking.amount - booking.tax).toFixed(2)),
					taxAmount: booking.tax,
					totalAmount: booking.amount,
					productNameSnapshot: "Hotel Sol",
					variantNameSnapshot: "Suite Norte",
					ratePlanNameSnapshot: "Plan flexible",
				},
			})

		await db
			.insert(BookingTaxFee)
			.values({
				id: `tax-${booking.id}`,
				bookingId: booking.id,
				name: "Impuestos visibles",
				breakdownJson: [{ name: "Impuesto local", amount: booking.tax, currency: "USD" }],
				totalAmount: booking.tax,
				createdAt: NOW,
			})
			.onConflictDoUpdate({
				target: [BookingTaxFee.id],
				set: {
					bookingId: booking.id,
					breakdownJson: [{ name: "Impuesto local", amount: booking.tax, currency: "USD" }],
					totalAmount: booking.tax,
				},
			})
	}
}

async function seedFinancialEvidence(): Promise<void> {
	await db
		.insert(ProviderFinancialProfile)
		.values({
			providerId,
			payoutMethodReference: "qa-visible-external-reference",
			payoutSchedule: "manual_review",
			currency: "USD",
			taxProfileStatus: "verified",
			status: "pending_review",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [ProviderFinancialProfile.providerId],
			set: {
				payoutMethodReference: "qa-visible-external-reference",
				payoutSchedule: "manual_review",
				currency: "USD",
				taxProfileStatus: "verified",
				status: "pending_review",
				updatedAt: NOW,
			},
		})

	await db
		.insert(FinancialExceptionRecord)
		.values({
			id: "qa-fin-exception-1045-missing-payment-proof",
			bookingId: "1045",
			providerId,
			code: "missing_payment_reference",
			severity: "attention",
			status: "open",
			basis: "financial_evidence",
			reason: "Falta comprobante de cobro para validar la reserva 1045.",
			nextOwner: "financial_operations",
			source: "operator_review",
			openedAt: daysAgo(4),
			createdAt: daysAgo(4),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [FinancialExceptionRecord.id],
			set: {
				providerId,
				status: "open",
				reason: "Falta comprobante de cobro para validar la reserva 1045.",
				nextOwner: "financial_operations",
				updatedAt: NOW,
			},
		})

	const paymentRows = [
		{
			id: "qa-payment-1046-capture",
			bookingId: "1046",
			type: "capture",
			amount: 280,
			externalReference: "stripe-demo-dup-9F2A",
			occurredAt: daysAgo(5),
		},
		{
			id: "qa-payment-1047-authorization-duplicate",
			bookingId: "1047",
			type: "authorization",
			amount: 410,
			externalReference: "stripe-demo-dup-9F2A",
			occurredAt: daysAgo(4),
		},
		{
			id: "qa-payment-1047-capture",
			bookingId: "1047",
			type: "capture",
			amount: 410,
			externalReference: "stripe-demo-1047-CB88",
			occurredAt: daysAgo(4),
		},
		{
			id: "qa-payment-1048-capture",
			bookingId: "1048",
			type: "capture",
			amount: 500,
			externalReference: "stripe-demo-1048-ZA71",
			occurredAt: daysAgo(3),
		},
		{
			id: "qa-payment-1050-capture",
			bookingId: "1050",
			type: "capture",
			amount: 440,
			externalReference: "stripe-demo-1050-KP42",
			occurredAt: daysAgo(2),
		},
		{
			id: "qa-payment-unmatched-7C11",
			bookingId: "unmatched:qa-demo-7C11",
			type: "capture",
			amount: 155,
			externalReference: "stripe-demo-unmatched-7C11",
			occurredAt: daysAgo(2),
		},
	] as const

	for (const row of paymentRows) {
		await db
			.insert(PaymentTransaction)
			.values({
				...row,
				providerId,
				status: "visible",
				currency: "USD",
				pspProvider: "Stripe",
				idempotencyKey: `qa-${row.id}`,
				source: "demo_qa",
				createdAt: row.occurredAt,
				updatedAt: NOW,
			})
			.onConflictDoUpdate({
				target: [PaymentTransaction.id],
				set: {
					bookingId: row.bookingId,
					providerId,
					type: row.type,
					status: "visible",
					amount: row.amount,
					currency: "USD",
					externalReference: row.externalReference,
					pspProvider: "Stripe",
					source: "demo_qa",
					updatedAt: NOW,
				},
			})
	}

	await db
		.insert(FinancialSettlementRecord)
		.values({
			id: "qa-settlement-1046-visible",
			bookingId: "1046",
			providerId,
			settlementReference: "stripe-settlement-1046-S1",
			amount: 280,
			currency: "USD",
			settlementDate: daysAgo(3),
			source: "demo_qa",
			matchedAt: daysAgo(3),
			createdAt: daysAgo(3),
		})
		.onConflictDoUpdate({
			target: [FinancialSettlementRecord.id],
			set: {
				bookingId: "1046",
				providerId,
				amount: 280,
				currency: "USD",
				settlementReference: "stripe-settlement-1046-S1",
				settlementDate: daysAgo(3),
				matchedAt: daysAgo(3),
			},
		})

	await db
		.insert(ReconciliationMatch)
		.values({
			id: "qa-reconciliation-1048-matched",
			bookingId: "1048",
			providerId,
			contractAmount: 500,
			paymentAmount: 500,
			settlementAmount: 500,
			differenceAmount: 0,
			status: "matched",
			mismatchReasons: [],
			basis: "booking_snapshot_payment_transaction_settlement_evidence",
			reviewStatus: "reviewed",
			reviewState: "fresh",
			comparisonFingerprint: "qa-reconciliation-1048-fresh",
			reviewFingerprint: "qa-reconciliation-1048-fresh",
			reviewedAt: daysAgo(1),
			reviewedBy: "qa-financial-seed",
			reviewNote: "Caso demo revisado para validar pagos pendientes a proveedores.",
			createdAt: daysAgo(1),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [ReconciliationMatch.id],
			set: {
				providerId,
				status: "matched",
				reviewStatus: "reviewed",
				reviewState: "fresh",
				updatedAt: NOW,
			},
		})

	await db
		.insert(ReconciliationMatch)
		.values({
			id: "qa-reconciliation-1050-matched",
			bookingId: "1050",
			providerId,
			contractAmount: 440,
			paymentAmount: 440,
			settlementAmount: 440,
			differenceAmount: 0,
			status: "matched",
			mismatchReasons: [],
			basis: "booking_snapshot_payment_transaction_settlement_evidence",
			reviewStatus: "reviewed",
			reviewState: "fresh",
			comparisonFingerprint: "qa-reconciliation-1050-fresh",
			reviewFingerprint: "qa-reconciliation-1050-fresh",
			reviewedAt: daysAgo(1),
			reviewedBy: "qa-financial-seed",
			reviewNote: "Caso demo revisado para mostrar pagos pendientes bloqueados.",
			createdAt: daysAgo(1),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [ReconciliationMatch.id],
			set: {
				providerId,
				status: "matched",
				reviewStatus: "reviewed",
				reviewState: "fresh",
				updatedAt: NOW,
			},
		})
}

async function seedProviderFinance(): Promise<void> {
	await db
		.insert(ProviderStatement)
		.values({
			id: "qa-provider-statement-visible",
			providerId,
			statementReference: "qa-statement-demo-visible",
			periodStart: new Date("2026-07-01T00:00:00.000Z"),
			periodEnd: new Date("2026-07-31T00:00:00.000Z"),
			status: "visible",
			totalGrossAmount: 500,
			totalCommissionAmount: 75,
			totalTaxAmount: 60,
			totalNetPayable: 365,
			currency: "USD",
			basis: "provider_finance_demo_read_artifact",
			createdAt: daysAgo(1),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [ProviderStatement.id],
			set: {
				providerId,
				status: "visible",
				totalGrossAmount: 500,
				totalCommissionAmount: 75,
				totalTaxAmount: 60,
				totalNetPayable: 365,
				updatedAt: NOW,
			},
		})

	const payableBooking = bookings.find((booking) => booking.id === "1048")
	if (!payableBooking) return

	await db
		.insert(ProviderPayableSnapshot)
		.values({
			id: "qa-payable-1048-blocked-by-commission",
			bookingId: "1048",
			providerId,
			grossAmount: payableBooking.amount,
			commissionAmount: 0,
			taxAmount: payableBooking.tax,
			netPayable: Number((payableBooking.amount - payableBooking.tax).toFixed(2)),
			currency: "USD",
			basis: "provider_payable_demo_missing_commission_review",
			snapshotAt: daysAgo(1),
			createdAt: daysAgo(1),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [ProviderPayableSnapshot.id],
			set: {
				providerId,
				grossAmount: payableBooking.amount,
				commissionAmount: 0,
				taxAmount: payableBooking.tax,
				netPayable: Number((payableBooking.amount - payableBooking.tax).toFixed(2)),
				basis: "provider_payable_demo_missing_commission_review",
				snapshotAt: daysAgo(1),
				updatedAt: NOW,
			},
		})

	const blockedPayableBooking = bookings.find((booking) => booking.id === "1050")
	if (blockedPayableBooking) {
		const commission = commissionAmount(blockedPayableBooking.amount)
		await db
			.insert(ProviderPayableSnapshot)
			.values({
				id: "qa-payable-1050-provider-profile-blocked",
				bookingId: "1050",
				providerId,
				grossAmount: blockedPayableBooking.amount,
				commissionAmount: commission,
				taxAmount: blockedPayableBooking.tax,
				netPayable: Number(
					(blockedPayableBooking.amount - commission - blockedPayableBooking.tax).toFixed(2)
				),
				currency: "USD",
				basis: "provider_payable_demo_profile_review",
				snapshotAt: daysAgo(1),
				createdAt: daysAgo(1),
				updatedAt: NOW,
			})
			.onConflictDoUpdate({
				target: [ProviderPayableSnapshot.id],
				set: {
					providerId,
					grossAmount: blockedPayableBooking.amount,
					commissionAmount: commission,
					taxAmount: blockedPayableBooking.tax,
					netPayable: Number(
						(blockedPayableBooking.amount - commission - blockedPayableBooking.tax).toFixed(2)
					),
					basis: "provider_payable_demo_profile_review",
					snapshotAt: daysAgo(1),
					updatedAt: NOW,
				},
			})
	}

	for (const booking of bookings.filter((entry) => entry.id !== "1048")) {
		const commission = commissionAmount(booking.amount)
		await db
			.insert(CommissionSnapshot)
			.values({
				id: `qa-commission-${booking.id}`,
				bookingId: booking.id,
				providerId,
				commissionRate: 0.15,
				commissionAmount: commission,
				basis: "provider_finance_demo_contract_snapshot",
				currency: "USD",
				snapshotAt: daysAgo(2),
				createdAt: daysAgo(2),
			})
			.onConflictDoUpdate({
				target: [CommissionSnapshot.id],
				set: {
					providerId,
					commissionRate: 0.15,
					commissionAmount: commission,
					basis: "provider_finance_demo_contract_snapshot",
					currency: "USD",
					snapshotAt: daysAgo(2),
				},
			})
	}
}

async function seedRefundsAndTimeline(): Promise<void> {
	await db
		.insert(RefundHandoffRecord)
		.values({
			id: "qa-refund-1051-needs-review",
			bookingId: "1051",
			providerId,
			status: "required",
			reason: "provider_issue",
			refundType: "partial",
			expectedAmount: 90,
			currency: "USD",
			basis: "operator_review",
			nextOwner: "support",
			openedAt: daysAgo(2),
			notes: "Caso demo: soporte debe revisar si corresponde seguimiento de reembolso.",
			createdAt: daysAgo(2),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [RefundHandoffRecord.id],
			set: {
				providerId,
				status: "required",
				expectedAmount: 90,
				nextOwner: "support",
				notes: "Caso demo: soporte debe revisar si corresponde seguimiento de reembolso.",
				updatedAt: NOW,
			},
		})

	await db
		.insert(RefundHandoffRecord)
		.values({
			id: "qa-refund-1049-waiting-proof",
			bookingId: "1049",
			providerId,
			status: "waiting_external",
			reason: "cancellation",
			refundType: "partial",
			expectedAmount: 120,
			currency: "USD",
			basis: "booking_cancelled",
			nextOwner: "support",
			openedAt: daysAgo(6),
			acknowledgedAt: daysAgo(5),
			notes: "Esperando comprobante externo para cerrar el seguimiento del reembolso.",
			createdAt: daysAgo(6),
			updatedAt: NOW,
		})
		.onConflictDoUpdate({
			target: [RefundHandoffRecord.id],
			set: {
				providerId,
				status: "waiting_external",
				expectedAmount: 120,
				nextOwner: "support",
				notes: "Esperando comprobante externo para cerrar el seguimiento del reembolso.",
				updatedAt: NOW,
			},
		})

	await db
		.insert(FinancialReviewEvent)
		.values({
			id: "qa-review-event-1049-refund-waiting",
			bookingId: "1049",
			providerId,
			refundHandoffId: "qa-refund-1049-waiting-proof",
			type: "refund_handoff_acknowledged",
			actorId: "qa-financial-seed",
			actorType: "system_seed",
			payloadJson: {
				note: "Caso demo: soporte espera comprobante externo.",
				visibilityOnly: true,
			},
			createdAt: daysAgo(5),
		})
		.onConflictDoUpdate({
			target: [FinancialReviewEvent.id],
			set: {
				bookingId: "1049",
				providerId,
				refundHandoffId: "qa-refund-1049-waiting-proof",
				createdAt: daysAgo(5),
			},
		})
}

export default async function seedFinancialOperationalDemo(): Promise<void> {
	const userId = await ensureUser(QA_EMAIL)
	providerId = await resolveProviderIdForUser(userId)
	await seedCatalog(userId)
	await seedBookings()
	await seedFinancialEvidence()
	await seedProviderFinance()
	await seedRefundsAndTimeline()
	console.log(
		`✅ Seed financiero operacional listo para ${QA_EMAIL}: cobro sin comprobante, referencia duplicada, liquidación faltante, pago pendiente bloqueado por comisión y reembolso esperando comprobante.`
	)
}
