import {
	and,
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	desc,
	eq,
	gte,
	inArray,
	lte,
	PaymentTransaction,
	Product,
	User,
	Variant,
} from "astro:db"

export type BookingLifecycleState =
	| "upcoming_arrival"
	| "in_house"
	| "departure_due"
	| "checked_out"
	| "no_show"
	| "cancelled"
	| "pending_confirmation"
	| "unknown"

type BookingLifecycle = {
	state: BookingLifecycleState
	label: string
	basis: "stored_status" | "stored_operation" | "derived_visibility"
	reality: "persisted_status" | "persisted_operation" | "date_derived_visibility"
}

type ListFilters = {
	providerId: string
	status?: string
	from?: string
	to?: string
}

type BookingDetailKey = {
	providerId: string
	bookingId: string
}

function dateOnly(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	const raw = String(value).trim()
	if (!raw) return null
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
	const parsed = new Date(raw)
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function asIso(value: unknown): string | null {
	if (!value) return null
	const parsed = value instanceof Date ? value : new Date(String(value))
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

export function deriveBookingLifecycle(params: {
	status: string | null
	operationalStatus: string | null
	checkIn: string | null
	checkOut: string | null
}): BookingLifecycle {
	const status = String(params.status ?? "")
		.trim()
		.toLowerCase()
	const operationalStatus = String(params.operationalStatus ?? "")
		.trim()
		.toLowerCase()

	if (status === "cancelled" || operationalStatus === "cancelled") {
		return {
			state: "cancelled",
			label: "Cancelada",
			basis: "stored_status",
			reality: "persisted_status",
		}
	}
	if (operationalStatus === "checked_in") {
		return {
			state: "in_house",
			label: "En estancia",
			basis: "stored_operation",
			reality: "persisted_operation",
		}
	}
	if (operationalStatus === "checked_out") {
		return {
			state: "checked_out",
			label: "Salida registrada",
			basis: "stored_operation",
			reality: "persisted_operation",
		}
	}
	if (operationalStatus === "no_show") {
		return {
			state: "no_show",
			label: "No presentación",
			basis: "stored_operation",
			reality: "persisted_operation",
		}
	}
	if (status !== "confirmed") {
		return {
			state: "pending_confirmation",
			label: "Pendiente de confirmación",
			basis: "stored_status",
			reality: "persisted_status",
		}
	}
	if (!params.checkIn || !params.checkOut) {
		return {
			state: "unknown",
			label: "Fechas incompletas",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}

	const today = todayIso()
	if (today < params.checkIn) {
		return {
			state: "upcoming_arrival",
			label: "Próxima llegada",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	if (today === params.checkOut) {
		return {
			state: "departure_due",
			label: "Salida hoy",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	if (today > params.checkOut) {
		return {
			state: "checked_out",
			label: "Estancia finalizada sin salida registrada",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	return {
		state: "in_house",
		label: "Llegada pendiente de registrar",
		basis: "derived_visibility",
		reality: "date_derived_visibility",
	}
}

function readOccupancyDetail(
	snapshot: unknown,
	fallback: { adults?: number | null; children?: number | null } = {}
) {
	const value = snapshot && typeof snapshot === "object" ? (snapshot as any).occupancyDetail : null
	return {
		adults: Math.max(0, Number(value?.adults ?? fallback.adults ?? 0)),
		children: Math.max(0, Number(value?.children ?? fallback.children ?? 0)),
		infants: Math.max(0, Number(value?.infants ?? 0)),
	}
}

function paymentAmounts(
	transactions: Array<{ type: string | null; status: string | null; amount: number | null }>,
	totalAmount: number
) {
	const recognized = transactions.filter((row) =>
		["recorded", "visible"].includes(String(row.status ?? "").toLowerCase())
	)
	const captured = recognized
		.filter((row) => ["capture", "payment"].includes(String(row.type ?? "").toLowerCase()))
		.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
	const refunded = recognized
		.filter((row) => String(row.type ?? "").toLowerCase() === "refund")
		.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
	const paidAmount = Math.max(0, captured - refunded)
	const pendingAmount = Math.max(0, totalAmount - paidAmount)
	return {
		paidAmount,
		pendingAmount,
		state: pendingAmount <= 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "pending",
	}
}

function countBy(
	items: Array<{ lifecycleState: BookingLifecycleState }>,
	state: BookingLifecycleState
) {
	return items.filter((item) => item.lifecycleState === state).length
}

export class BookingOperationsQueryRepository {
	async listByProvider(filters: ListFilters) {
		const predicates = [eq(Booking.providerId, filters.providerId)]
		if (filters.status && filters.status !== "all") {
			predicates.push(eq(Booking.status, filters.status))
		}
		if (filters.from) predicates.push(gte(Booking.checkInDate, filters.from))
		if (filters.to) predicates.push(lte(Booking.checkOutDate, filters.to))

		const rows = await db
			.select({
				bookingId: Booking.id,
				status: Booking.status,
				operationalStatus: Booking.operationalStatus,
				currency: Booking.currency,
				totalAmount: Booking.totalAmount,
				bookingDate: Booking.bookingDate,
				confirmedAt: Booking.confirmedAt,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				guestNameSnapshot: Booking.guestNameSnapshot,
				guestEmailSnapshot: Booking.guestEmailSnapshot,
				detailId: BookingRoomDetail.id,
				detailCheckIn: BookingRoomDetail.checkIn,
				detailCheckOut: BookingRoomDetail.checkOut,
				detailVariantId: BookingRoomDetail.variantId,
				detailRatePlanId: BookingRoomDetail.ratePlanId,
				adults: BookingRoomDetail.adults,
				children: BookingRoomDetail.children,
				pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson,
				productIdSnapshot: BookingRoomDetail.productIdSnapshot,
				productNameSnapshot: BookingRoomDetail.productNameSnapshot,
				variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
				ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
				occupancySnapshotJson: BookingRoomDetail.occupancySnapshotJson,
				productId: Product.id,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(Booking)
			.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(and(...predicates))
			.orderBy(desc(Booking.bookingDate), desc(Booking.id))
			.all()

		const bookingIds = [...new Set(rows.map((row) => row.bookingId))]
		const transactions = bookingIds.length
			? await db
					.select({
						bookingId: PaymentTransaction.bookingId,
						type: PaymentTransaction.type,
						status: PaymentTransaction.status,
						amount: PaymentTransaction.amount,
					})
					.from(PaymentTransaction)
					.where(
						and(
							eq(PaymentTransaction.providerId, filters.providerId),
							inArray(PaymentTransaction.bookingId, bookingIds)
						)
					)
					.all()
			: []
		const transactionsByBooking = new Map<string, typeof transactions>()
		for (const row of transactions) {
			const bucket = transactionsByBooking.get(row.bookingId) ?? []
			bucket.push(row)
			transactionsByBooking.set(row.bookingId, bucket)
		}

		const grouped = new Map<string, typeof rows>()
		for (const row of rows) {
			const bucket = grouped.get(row.bookingId) ?? []
			bucket.push(row)
			grouped.set(row.bookingId, bucket)
		}

		const items = Array.from(grouped.values()).map((group) => {
			const row = group[0]
			const checkIn = dateOnly(row.checkInDate ?? row.detailCheckIn)
			const checkOut = dateOnly(row.checkOutDate ?? row.detailCheckOut)
			const lifecycle = deriveBookingLifecycle({
				status: row.status,
				operationalStatus: row.operationalStatus,
				checkIn,
				checkOut,
			})
			const firstSnapshot =
				group.find((item) => item.occupancySnapshotJson)?.occupancySnapshotJson ??
				group.find((item) => item.pricingBreakdownJson)?.pricingBreakdownJson
			const occupancyDetail = readOccupancyDetail(firstSnapshot, row)
			const hasTextualSnapshot = group
				.filter((item) => item.detailId)
				.every(
					(item) =>
						Boolean(item.productNameSnapshot ?? item.productName) &&
						Boolean(item.variantNameSnapshot ?? item.variantName) &&
						Boolean(item.ratePlanNameSnapshot)
				)
			const hasContractSnapshot = group
				.filter((item) => item.detailId)
				.every((item) => Boolean(item.detailRatePlanId && item.pricingBreakdownJson))
			const totalAmount = Number(row.totalAmount ?? 0)

			return {
				bookingId: row.bookingId,
				guestName: row.guestNameSnapshot ?? null,
				guestEmail: row.guestEmailSnapshot ?? null,
				productId: row.productIdSnapshot ?? row.productId ?? null,
				productName: row.productNameSnapshot ?? row.productName ?? null,
				variantId: row.detailVariantId ?? null,
				variantName: row.variantNameSnapshot ?? row.variantName ?? null,
				ratePlanId: row.detailRatePlanId ?? null,
				ratePlanName: row.ratePlanNameSnapshot ?? null,
				checkIn,
				checkOut,
				totalAmount,
				currency: String(row.currency ?? "USD").toUpperCase(),
				status: String(row.status ?? "draft"),
				operationalStatus: String(row.operationalStatus ?? "untracked"),
				createdAt: asIso(row.bookingDate),
				confirmedAt: asIso(row.confirmedAt),
				rooms: group.filter((item) => item.detailId).length,
				occupancyDetail,
				lifecycleState: lifecycle.state,
				lifecycleLabel: lifecycle.label,
				lifecycleBasis: lifecycle.basis,
				lifecycleReality: lifecycle.reality,
				refundHandoffState: lifecycle.state === "cancelled" ? "handoff_required" : "not_applicable",
				reconciliationState: lifecycle.state === "cancelled" ? "handoff_pending" : "snapshot_ready",
				snapshotState:
					hasContractSnapshot && hasTextualSnapshot
						? "contract_snapshot_present"
						: "snapshot_incomplete",
				payment: paymentAmounts(transactionsByBooking.get(row.bookingId) ?? [], totalAmount),
			}
		})

		return {
			items,
			summary: {
				total: items.length,
				upcomingArrivals: countBy(items, "upcoming_arrival"),
				inHouse: countBy(items, "in_house"),
				departuresDue: countBy(items, "departure_due"),
				checkedOut: countBy(items, "checked_out"),
				noShow: countBy(items, "no_show"),
				cancelled: countBy(items, "cancelled"),
				refundHandoffRequired: items.filter(
					(item) => item.refundHandoffState === "handoff_required"
				).length,
				reconciliationPending: items.filter(
					(item) => item.reconciliationState === "handoff_pending"
				).length,
				contractSnapshotsReady: items.filter(
					(item) => item.snapshotState === "contract_snapshot_present"
				).length,
				modificationWorkflow: "not_automated",
			},
		}
	}

	async getById(key: BookingDetailKey) {
		const booking = await db
			.select({
				id: Booking.id,
				userId: Booking.userId,
				guestEmail: User.email,
				guestFirstName: User.firstName,
				guestLastName: User.lastName,
				guestEmailSnapshot: Booking.guestEmailSnapshot,
				guestNameSnapshot: Booking.guestNameSnapshot,
				guestContactSnapshotJson: Booking.guestContactSnapshotJson,
				lifecycleAuditJson: Booking.lifecycleAuditJson,
				refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
				contractSnapshotVersion: Booking.contractSnapshotVersion,
				ratePlanId: Booking.ratePlanId,
				status: Booking.status,
				operationalStatus: Booking.operationalStatus,
				checkedInAt: Booking.checkedInAt,
				checkedInBy: Booking.checkedInBy,
				checkedOutAt: Booking.checkedOutAt,
				checkedOutBy: Booking.checkedOutBy,
				noShowAt: Booking.noShowAt,
				noShowBy: Booking.noShowBy,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				currency: Booking.currency,
				totalAmount: Booking.totalAmount,
				numAdults: Booking.numAdults,
				numChildren: Booking.numChildren,
				bookingDate: Booking.bookingDate,
				confirmedAt: Booking.confirmedAt,
				source: Booking.source,
			})
			.from(Booking)
			.leftJoin(User, eq(User.id, Booking.userId))
			.where(and(eq(Booking.id, key.bookingId), eq(Booking.providerId, key.providerId)))
			.get()
		if (!booking) return null

		const [roomRows, taxLines, policyRows, transactions] = await Promise.all([
			db
				.select({
					id: BookingRoomDetail.id,
					variantId: BookingRoomDetail.variantId,
					ratePlanId: BookingRoomDetail.ratePlanId,
					checkIn: BookingRoomDetail.checkIn,
					checkOut: BookingRoomDetail.checkOut,
					adults: BookingRoomDetail.adults,
					children: BookingRoomDetail.children,
					subtotalAmount: BookingRoomDetail.subtotalAmount,
					taxAmount: BookingRoomDetail.taxAmount,
					totalAmount: BookingRoomDetail.totalAmount,
					pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson,
					productIdSnapshot: BookingRoomDetail.productIdSnapshot,
					productNameSnapshot: BookingRoomDetail.productNameSnapshot,
					variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
					ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
					occupancySnapshotJson: BookingRoomDetail.occupancySnapshotJson,
					productId: Product.id,
					productName: Product.name,
					variantName: Variant.name,
				})
				.from(BookingRoomDetail)
				.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
				.leftJoin(Product, eq(Product.id, Variant.productId))
				.where(eq(BookingRoomDetail.bookingId, key.bookingId))
				.all(),
			db.select().from(BookingTaxFee).where(eq(BookingTaxFee.bookingId, key.bookingId)).all(),
			db
				.select()
				.from(BookingPolicySnapshot)
				.where(eq(BookingPolicySnapshot.bookingId, key.bookingId))
				.all(),
			db
				.select({
					id: PaymentTransaction.id,
					type: PaymentTransaction.type,
					status: PaymentTransaction.status,
					amount: PaymentTransaction.amount,
					currency: PaymentTransaction.currency,
					externalReference: PaymentTransaction.externalReference,
					occurredAt: PaymentTransaction.occurredAt,
				})
				.from(PaymentTransaction)
				.where(
					and(
						eq(PaymentTransaction.bookingId, key.bookingId),
						eq(PaymentTransaction.providerId, key.providerId)
					)
				)
				.orderBy(desc(PaymentTransaction.occurredAt))
				.all(),
		])
		if (!roomRows.length) return null

		const allocations = roomRows.map((row, index) => ({
			allocationId: row.id,
			sequence: index + 1,
			productId: row.productIdSnapshot ?? row.productId ?? null,
			productName: row.productNameSnapshot ?? row.productName ?? null,
			variantId: row.variantId,
			variantName: row.variantNameSnapshot ?? row.variantName ?? null,
			ratePlanId: row.ratePlanId ?? booking.ratePlanId,
			ratePlanName: row.ratePlanNameSnapshot ?? null,
			checkIn: dateOnly(row.checkIn),
			checkOut: dateOnly(row.checkOut),
			occupancyDetail: readOccupancyDetail(row.occupancySnapshotJson, row),
			occupancySnapshot: row.occupancySnapshotJson ?? null,
			subtotalAmount: Number(row.subtotalAmount ?? 0),
			taxAmount: Number(row.taxAmount ?? 0),
			totalAmount: Number(row.totalAmount ?? 0),
			pricingSnapshot: row.pricingBreakdownJson ?? null,
		}))
		const checkIn = dateOnly(booking.checkInDate ?? roomRows[0]?.checkIn)
		const checkOut = dateOnly(booking.checkOutDate ?? roomRows[0]?.checkOut)
		const lifecycle = deriveBookingLifecycle({
			status: booking.status,
			operationalStatus: booking.operationalStatus,
			checkIn,
			checkOut,
		})
		const totalAmount = Number(booking.totalAmount ?? 0)
		const guestContact =
			booking.guestContactSnapshotJson && typeof booking.guestContactSnapshotJson === "object"
				? (booking.guestContactSnapshotJson as Record<string, unknown>)
				: null
		const liveGuestName = [booking.guestFirstName, booking.guestLastName]
			.map((part) => String(part ?? "").trim())
			.filter(Boolean)
			.join(" ")
		const snapshotIntegrity = {
			hasRatePlanId: Boolean(booking.ratePlanId || allocations.every((row) => row.ratePlanId)),
			hasPricingBreakdown: allocations.every((row) => Boolean(row.pricingSnapshot)),
			hasPolicySnapshot: policyRows.length > 0,
			hasTaxSnapshot: taxLines.length > 0,
			hasOccupancyDetail: allocations.every(
				(row) => row.occupancyDetail.adults + row.occupancyDetail.children > 0
			),
			hasTextualSnapshot: allocations.every(
				(row) => Boolean(row.productName) && Boolean(row.variantName) && Boolean(row.ratePlanName)
			),
			hasGuestSnapshot: Boolean(booking.guestEmailSnapshot || guestContact),
			source: "booking_contract_snapshot",
		}
		const refundHandoff =
			lifecycle.state === "cancelled"
				? {
						state: "handoff_required",
						label: "Reembolso pendiente",
						owner: "Payments & Finance",
						boundary: "visibility_only",
					}
				: {
						state: "not_applicable",
						label: "Sin reembolso pendiente",
						owner: "Payments & Finance",
						boundary: "visibility_only",
					}

		return {
			booking: {
				id: booking.id,
				status: booking.status,
				operationalStatus: booking.operationalStatus,
				checkedInAt: asIso(booking.checkedInAt),
				checkedInBy: booking.checkedInBy,
				checkedOutAt: asIso(booking.checkedOutAt),
				checkedOutBy: booking.checkedOutBy,
				noShowAt: asIso(booking.noShowAt),
				noShowBy: booking.noShowBy,
				checkIn,
				checkOut,
				currency: String(booking.currency ?? "USD").toUpperCase(),
				totalAmount,
				confirmedAt: asIso(booking.confirmedAt),
				createdAt: asIso(booking.bookingDate ?? booking.confirmedAt),
				source: booking.source,
				ratePlanId: booking.ratePlanId,
				guestSnapshot: {
					userId: booking.userId,
					name:
						booking.guestNameSnapshot ??
						(String(guestContact?.name ?? "").trim() || liveGuestName || null),
					email:
						booking.guestEmailSnapshot ??
						(String(guestContact?.email ?? "").trim() || booking.guestEmail || null),
					adults: Number(booking.numAdults ?? 0),
					children: Number(booking.numChildren ?? 0),
					source: guestContact ? "contract_snapshot" : "live_user_fallback",
				},
				rooms: allocations.length,
				lifecycle,
				refundHandoff,
				snapshotIntegrity,
				lifecycleAudit:
					booking.lifecycleAuditJson && typeof booking.lifecycleAuditJson === "object"
						? booking.lifecycleAuditJson
						: {
								mode: "derived_visibility",
								storedStatus: booking.status,
								storedOperationalStatus: booking.operationalStatus,
							},
				contractSnapshotVersion:
					booking.contractSnapshotVersion ?? "missing_contract_snapshot_version",
				payment: paymentAmounts(transactions, totalAmount),
			},
			allocations,
			taxes: taxLines.map((line) => ({
				id: line.id,
				name: line.name ?? "Impuestos y cargos",
				totalAmount: Number(line.totalAmount ?? 0),
				breakdown: line.breakdownJson,
				createdAt: asIso(line.createdAt),
			})),
			policies: policyRows.map((line) => {
				const snapshot = (line.policySnapshotJson ?? null) as any
				return {
					id: line.id,
					policyType: line.category ?? snapshot?.category ?? "policy",
					description: snapshot?.description ?? null,
					policyId: line.policyId,
					snapshot,
					createdAt: asIso(line.createdAt),
				}
			}),
			payments: transactions.map((row) => ({ ...row, occurredAt: asIso(row.occurredAt) })),
			modifications: {
				state: "not_automated",
				label: "Sin modificaciones registradas",
			},
		}
	}
}

export const bookingOperationsQueryRepository = new BookingOperationsQueryRepository()
