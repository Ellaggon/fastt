import {
	and,
	Booking,
	BookingRoomDetail,
	CommercialRuleApplication,
	db,
	eq,
	Hold,
	PolicyAssignment,
	RatePlan,
	RatePlanOccupancyPolicy,
	sql,
} from "astro:db"

async function safeCount(load: () => Promise<{ value: number } | undefined>) {
	try {
		return Number((await load())?.value ?? 0)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (message.includes("no such table")) return 0
		throw error
	}
}

export async function getRatePlanRemovalReadiness(params: {
	ratePlanId: string
	variantId: string
	isActive: boolean
	isDefault: boolean
}) {
	const countExpression = sql<number>`count(*)`
	const [bookingCount, bookingRoomCount, holdCount, ruleCount, assignmentCount, priceCount] =
		await Promise.all([
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(Booking)
					.where(eq(Booking.ratePlanId, params.ratePlanId))
					.get()
			),
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(BookingRoomDetail)
					.where(eq(BookingRoomDetail.ratePlanId, params.ratePlanId))
					.get()
			),
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(Hold)
					.where(eq(Hold.ratePlanId, params.ratePlanId))
					.get()
			),
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(CommercialRuleApplication)
					.where(
						and(
							eq(CommercialRuleApplication.scope, "rate_plan"),
							eq(CommercialRuleApplication.scopeId, params.ratePlanId)
						)
					)
					.get()
			),
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(PolicyAssignment)
					.where(
						and(
							eq(PolicyAssignment.scope, "rate_plan"),
							eq(PolicyAssignment.scopeId, params.ratePlanId)
						)
					)
					.get()
			),
			safeCount(() =>
				db
					.select({ value: countExpression })
					.from(RatePlanOccupancyPolicy)
					.where(eq(RatePlanOccupancyPolicy.ratePlanId, params.ratePlanId))
					.get()
			),
		])

	const activeAlternatives = await safeCount(() =>
		db
			.select({ value: countExpression })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, params.variantId),
					eq(RatePlan.isActive, true),
					sql`${RatePlan.id} <> ${params.ratePlanId}`
				)
			)
			.get()
	)
	const reservationCount = Math.max(bookingCount, bookingRoomCount)
	const blockers: string[] = []
	if (params.isActive) blockers.push("Desactiva la tarifa antes de eliminarla.")
	if (reservationCount > 0) blockers.push("Tiene reservas asociadas y debe conservarse.")
	if (holdCount > 0) blockers.push("Tiene reservas en proceso o retenciones activas.")
	if (params.isDefault && activeAlternatives > 0) {
		blockers.push("Designa otra tarifa principal antes de eliminarla.")
	}

	return {
		canDelete: blockers.length === 0,
		blockers,
		reservationCount,
		holdCount,
		activeAlternatives,
		configuration: {
			ruleCount,
			assignmentCount,
			priceCount,
		},
	}
}
