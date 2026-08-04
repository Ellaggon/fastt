export type ChannelManagerMode = "sandbox" | "production"

export type ChannelManagerWarning = {
	code: string
	message: string
	itemIndex: number | null
	details?: unknown
}

export type ChannelManagerOperationMeta = {
	requestIds: string[]
	warnings: ChannelManagerWarning[]
	partial: boolean
	pageCount: number
}

export type ChannelManagerListResult<T> = ChannelManagerOperationMeta & {
	items: T[]
	fetchedAt: Date
}

export type ChannelManagerMutationResult = ChannelManagerOperationMeta & {
	ok: boolean
	submitted: number
	accepted: number
	rejected: number
	taskIds: string[]
}

export type ChannelManagerProperty = {
	id: string
	name: string
	city: string | null
	country: string | null
	currency: string | null
	timezone: string | null
	active: boolean | null
}

export type ChannelManagerRoomType = {
	id: string
	name: string
	propertyId: string
	units: number | null
	maxAdults: number | null
	maxChildren: number | null
}

export type ChannelManagerRatePlan = {
	id: string
	name: string
	propertyId: string
	roomTypeId: string | null
	currency: string | null
	derived: boolean
	readOnly: boolean
}

export type ChannelManagerDateRange =
	| { date: string; dateFrom?: never; dateTo?: never }
	| { date?: never; dateFrom: string; dateTo: string }

export type ChannelManagerAvailabilityUpdate = ChannelManagerDateRange & {
	propertyId: string
	roomTypeId: string
	availability: number
	days?: Array<"mo" | "tu" | "we" | "th" | "fr" | "sa" | "su">
}

export type ChannelManagerRateRestrictionUpdate = ChannelManagerDateRange & {
	propertyId: string
	ratePlanId: string
	days?: Array<"mo" | "tu" | "we" | "th" | "fr" | "sa" | "su">
	rate?: string
	minStayArrival?: number
	minStayThrough?: number
	minStay?: number
	maxStay?: number
	closedToArrival?: boolean
	closedToDeparture?: boolean
	stopSell?: boolean
}

export type ChannelManagerBookingRevision = {
	id: string
	propertyId: string
	bookingId: string
	uniqueId: string | null
	status: "new" | "modified" | "cancelled"
	arrivalDate: string | null
	departureDate: string | null
	insertedAt: string | null
	otaName: string | null
	otaReservationCode: string | null
	amount: string | null
	currency: string | null
	notes: string | null
	paymentCollect: "property" | "ota" | null
	paymentType: "credit_card" | "bank_transfer" | null
	customer: {
		name: string | null
		surname: string | null
		email: string | null
		phone: string | null
	} | null
	occupancy: { adults: number; children: number; infants: number } | null
	rooms: Array<{
		roomTypeId: string | null
		ratePlanId: string | null
		parentRatePlanId: string | null
		checkinDate: string | null
		checkoutDate: string | null
		amount: string | null
		occupancy: { adults: number; children: number; infants: number } | null
	}>
}

export type ChannelManagerAccessResult = ChannelManagerOperationMeta & {
	ok: boolean
	latencyMs: number
	message: string
}

export interface ChannelManagerAdapter {
	listProperties(): Promise<ChannelManagerListResult<ChannelManagerProperty>>
	listRoomTypes(input: {
		propertyId: string
	}): Promise<ChannelManagerListResult<ChannelManagerRoomType>>
	listRatePlans(input: {
		propertyId: string
	}): Promise<ChannelManagerListResult<ChannelManagerRatePlan>>
	pushAvailability(input: {
		values: ChannelManagerAvailabilityUpdate[]
	}): Promise<ChannelManagerMutationResult>
	pushRatesAndRestrictions(input: {
		values: ChannelManagerRateRestrictionUpdate[]
	}): Promise<ChannelManagerMutationResult>
	fetchBookingRevisions(input?: {
		propertyId?: string | null
	}): Promise<ChannelManagerListResult<ChannelManagerBookingRevision>>
	acknowledgeBookingRevision(input: { revisionId: string }): Promise<ChannelManagerMutationResult>
	testAccess(input?: { propertyId?: string | null }): Promise<ChannelManagerAccessResult>
}

export type ChannelManagerAdapterErrorKind =
	| "authentication"
	| "authorization"
	| "validation"
	| "not_found"
	| "rate_limit"
	| "timeout"
	| "network"
	| "upstream"
	| "invalid_response"

export class ChannelManagerAdapterError extends Error {
	readonly kind: ChannelManagerAdapterErrorKind
	readonly status: number | null
	readonly requestId: string | null
	readonly retryable: boolean
	readonly details: unknown

	constructor(params: {
		kind: ChannelManagerAdapterErrorKind
		message: string
		status?: number | null
		requestId?: string | null
		retryable?: boolean
		details?: unknown
		cause?: unknown
	}) {
		super(params.message, { cause: params.cause })
		this.name = "ChannelManagerAdapterError"
		this.kind = params.kind
		this.status = params.status ?? null
		this.requestId = params.requestId ?? null
		this.retryable = params.retryable ?? false
		this.details = params.details
	}
}
