import { z } from "zod"

import {
	ChannelManagerAdapterError,
	type ChannelManagerAccessResult,
	type ChannelManagerAdapter,
	type ChannelManagerAvailabilityUpdate,
	type ChannelManagerBookingRevision,
	type ChannelManagerListResult,
	type ChannelManagerMutationResult,
	type ChannelManagerProperty,
	type ChannelManagerRatePlan,
	type ChannelManagerRateRestrictionUpdate,
	type ChannelManagerRoomType,
	type ChannelManagerWarning,
} from "@/lib/channel-manager/channel-manager-adapter"
import { ChannexHttpClient } from "@/lib/channel-manager/channex/channex-client"
import {
	assertProviderIntegrationTestCredentialAllowed,
	isSyntheticProviderIntegrationCredential,
} from "@/lib/provider-integration-test-harness"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const textSchema = z.union([z.string(), z.number()]).transform(String)
const nullableTextSchema = z
	.union([z.string(), z.number(), z.null(), z.undefined()])
	.transform((value) => {
		const normalized = String(value ?? "").trim()
		return normalized || null
	})

const relationshipSchema = z
	.object({ data: z.object({ id: textSchema }).passthrough().nullable().optional() })
	.passthrough()
	.optional()

const propertyResourceSchema = z
	.object({
		id: textSchema,
		attributes: z
			.object({
				title: nullableTextSchema.optional(),
				name: nullableTextSchema.optional(),
				city: nullableTextSchema.optional(),
				country: nullableTextSchema.optional(),
				currency: nullableTextSchema.optional(),
				timezone: nullableTextSchema.optional(),
				is_active: z.union([z.boolean(), z.number(), z.string()]).nullish(),
			})
			.passthrough()
			.default({}),
	})
	.passthrough()

const roomTypeResourceSchema = z
	.object({
		id: textSchema,
		attributes: z
			.object({
				title: nullableTextSchema.optional(),
				name: nullableTextSchema.optional(),
				property_id: nullableTextSchema.optional(),
				count_of_rooms: z.coerce.number().int().nonnegative().nullish(),
				count: z.coerce.number().int().nonnegative().nullish(),
				occ_adults: z.coerce.number().int().nonnegative().nullish(),
				max_persons: z.coerce.number().int().nonnegative().nullish(),
				occ_children: z.coerce.number().int().nonnegative().nullish(),
			})
			.passthrough()
			.default({}),
		relationships: z.object({ property: relationshipSchema }).passthrough().optional(),
	})
	.passthrough()

const ratePlanResourceSchema = z
	.object({
		id: textSchema,
		attributes: z
			.object({
				title: nullableTextSchema.optional(),
				name: nullableTextSchema.optional(),
				property_id: nullableTextSchema.optional(),
				room_type_id: nullableTextSchema.optional(),
				currency: nullableTextSchema.optional(),
				inherit_rate: z.union([z.boolean(), z.number(), z.string()]).nullish(),
				parent_rate_plan_id: nullableTextSchema.optional(),
				read_only: z.union([z.boolean(), z.number(), z.string()]).nullish(),
			})
			.passthrough()
			.default({}),
		relationships: z
			.object({ property: relationshipSchema, room_type: relationshipSchema })
			.passthrough()
			.optional(),
	})
	.passthrough()

const bookingRoomSchema = z
	.object({
		room_type_id: nullableTextSchema.optional(),
		rate_plan_id: nullableTextSchema.optional(),
		checkin_date: nullableTextSchema.optional(),
		checkout_date: nullableTextSchema.optional(),
		amount: nullableTextSchema.optional(),
		meta: z
			.object({
				parent_rate_plan_id: nullableTextSchema.optional(),
			})
			.nullable()
			.optional(),
		occupancy: z
			.object({
				adults: z.coerce.number().int().nonnegative().default(0),
				children: z.coerce.number().int().nonnegative().default(0),
				infants: z.coerce.number().int().nonnegative().default(0),
			})
			.optional(),
	})
	.passthrough()

const bookingOccupancySchema = z.object({
	adults: z.coerce.number().int().nonnegative().default(0),
	children: z.coerce.number().int().nonnegative().default(0),
	infants: z.coerce.number().int().nonnegative().default(0),
})

const bookingCustomerSchema = z
	.object({
		name: nullableTextSchema.optional(),
		surname: nullableTextSchema.optional(),
		email: nullableTextSchema.optional(),
		mail: nullableTextSchema.optional(),
		phone: nullableTextSchema.optional(),
	})
	.passthrough()

const bookingRevisionResourceSchema = z
	.object({
		id: textSchema,
		attributes: z
			.object({
				property_id: textSchema,
				booking_id: textSchema,
				unique_id: nullableTextSchema.optional(),
				status: z.enum(["new", "modified", "cancelled"]),
				arrival_date: nullableTextSchema.optional(),
				departure_date: nullableTextSchema.optional(),
				inserted_at: nullableTextSchema.optional(),
				ota_name: nullableTextSchema.optional(),
				ota_reservation_code: nullableTextSchema.optional(),
				amount: nullableTextSchema.optional(),
				currency: nullableTextSchema.optional(),
				notes: nullableTextSchema.optional(),
				payment_collect: z.enum(["property", "ota"]).nullable().optional(),
				payment_type: z.enum(["credit_card", "bank_transfer"]).nullable().optional(),
				customer: bookingCustomerSchema.nullable().optional(),
				occupancy: bookingOccupancySchema.nullable().optional(),
				rooms: z.array(bookingRoomSchema).default([]),
			})
			.passthrough(),
	})
	.passthrough()

const availabilityValueSchema = z
	.object({
		propertyId: z.string().min(1),
		roomTypeId: z.string().min(1),
		availability: z.number().int().nonnegative(),
		date: dateSchema.optional(),
		dateFrom: dateSchema.optional(),
		dateTo: dateSchema.optional(),
		days: z.array(z.enum(["mo", "tu", "we", "th", "fr", "sa", "su"])).optional(),
	})
	.refine((value) => Boolean(value.date) !== Boolean(value.dateFrom && value.dateTo), {
		message: "Use date or dateFrom/dateTo",
	})

const restrictionValueSchema = z
	.object({
		propertyId: z.string().min(1),
		ratePlanId: z.string().min(1),
		date: dateSchema.optional(),
		dateFrom: dateSchema.optional(),
		dateTo: dateSchema.optional(),
		days: z.array(z.enum(["mo", "tu", "we", "th", "fr", "sa", "su"])).optional(),
		rate: z
			.string()
			.regex(/^\d+(\.\d+)?$/)
			.optional(),
		minStayArrival: z.number().int().positive().optional(),
		minStayThrough: z.number().int().positive().optional(),
		minStay: z.number().int().positive().optional(),
		maxStay: z.number().int().nonnegative().optional(),
		closedToArrival: z.boolean().optional(),
		closedToDeparture: z.boolean().optional(),
		stopSell: z.boolean().optional(),
	})
	.refine((value) => Boolean(value.date) !== Boolean(value.dateFrom && value.dateTo), {
		message: "Use date or dateFrom/dateTo",
	})
	.refine(
		(value) =>
			value.rate !== undefined ||
			value.minStayArrival !== undefined ||
			value.minStayThrough !== undefined ||
			value.minStay !== undefined ||
			value.maxStay !== undefined ||
			value.closedToArrival !== undefined ||
			value.closedToDeparture !== undefined ||
			value.stopSell !== undefined,
		{ message: "At least one rate or restriction value is required" }
	)

type ChannexAdapterOptions = {
	apiKey: string
	mode: "sandbox" | "production"
	timeoutMs?: number
	fetchImpl?: typeof fetch
	requestIdFactory?: () => string
}

function booleanValue(value: unknown): boolean {
	return value === true || value === 1 || String(value ?? "").toLowerCase() === "true"
}

function parseAdapterInput<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
	const parsed = schema.safeParse(value)
	if (parsed.success) return parsed.data
	throw new ChannelManagerAdapterError({
		kind: "validation",
		message: code,
		details: parsed.error.issues,
	})
}

function meta(params: {
	requestIds: string[]
	warnings: ChannelManagerWarning[]
	pageCount?: number
}) {
	return {
		requestIds: params.requestIds,
		warnings: params.warnings,
		partial: params.warnings.length > 0,
		pageCount: params.pageCount ?? 1,
	}
}

function mutationResult(
	submitted: number,
	response: {
		data: unknown
		meta: unknown
		requestId: string
		warnings: ChannelManagerWarning[]
	}
): ChannelManagerMutationResult {
	const rejectedIndexes = new Set(
		response.warnings
			.map((warning) => warning.itemIndex)
			.filter((index): index is number => index !== null && index >= 0 && index < submitted)
	)
	const rejected = rejectedIndexes.size || Math.min(submitted, response.warnings.length)
	return {
		ok: rejected < submitted,
		submitted,
		accepted: Math.max(0, submitted - rejected),
		rejected,
		taskIds: collectTaskIds(response.meta, response.data),
		...meta({ requestIds: [response.requestId], warnings: response.warnings }),
	}
}

function collectTaskIds(...values: unknown[]): string[] {
	const ids = new Set<string>()
	const visit = (value: unknown, key = "") => {
		if (Array.isArray(value)) {
			value.forEach((item) => visit(item, key))
			return
		}
		if (!value || typeof value !== "object") {
			if (/^task_?ids?$/i.test(key)) {
				const id = String(value ?? "").trim()
				if (id) ids.add(id)
			}
			return
		}
		const row = value as Record<string, unknown>
		if (String(row.type ?? "").toLowerCase() === "task") {
			const id = String(row.id ?? "").trim()
			if (id) ids.add(id)
		}
		for (const [childKey, child] of Object.entries(row)) {
			visit(child, childKey)
		}
	}
	values.forEach((value) => visit(value))
	return [...ids]
}

export class ChannexAdapter implements ChannelManagerAdapter {
	private readonly client: ChannexHttpClient
	private readonly synthetic: boolean

	constructor(options: ChannexAdapterOptions) {
		this.synthetic = isSyntheticProviderIntegrationCredential(options.apiKey)
		if (this.synthetic) {
			assertProviderIntegrationTestCredentialAllowed(options.apiKey, { mode: options.mode })
		}
		this.client = new ChannexHttpClient(options)
	}

	async listProperties(): Promise<ChannelManagerListResult<ChannelManagerProperty>> {
		if (this.synthetic) return this.syntheticProperties()
		const result = await this.client.paginate({
			path: "/properties/",
			itemSchema: propertyResourceSchema,
		})
		return {
			items: result.items.map((row) => ({
				id: row.id,
				name: row.attributes.title ?? row.attributes.name ?? `Propiedad ${row.id}`,
				city: row.attributes.city ?? null,
				country: row.attributes.country ?? null,
				currency: row.attributes.currency ?? null,
				timezone: row.attributes.timezone ?? null,
				active: row.attributes.is_active == null ? null : booleanValue(row.attributes.is_active),
			})),
			fetchedAt: new Date(),
			...meta(result),
		}
	}

	async listRoomTypes(input: {
		propertyId: string
	}): Promise<ChannelManagerListResult<ChannelManagerRoomType>> {
		const propertyId = parseAdapterInput(
			z.string().min(1),
			input.propertyId,
			"CHANNEL_MANAGER_PROPERTY_ID_INVALID"
		)
		if (this.synthetic) return this.syntheticRoomTypes(propertyId)
		const result = await this.client.paginate({
			path: "/room_types",
			query: { "filter[property_id]": propertyId },
			itemSchema: roomTypeResourceSchema,
		})
		return {
			items: result.items.map((row) => ({
				id: row.id,
				name: row.attributes.title ?? row.attributes.name ?? `Habitación ${row.id}`,
				propertyId:
					row.attributes.property_id ?? row.relationships?.property?.data?.id ?? propertyId,
				units: row.attributes.count_of_rooms ?? row.attributes.count ?? null,
				maxAdults: row.attributes.occ_adults ?? row.attributes.max_persons ?? null,
				maxChildren: row.attributes.occ_children ?? null,
			})),
			fetchedAt: new Date(),
			...meta(result),
		}
	}

	async listRatePlans(input: {
		propertyId: string
	}): Promise<ChannelManagerListResult<ChannelManagerRatePlan>> {
		const propertyId = parseAdapterInput(
			z.string().min(1),
			input.propertyId,
			"CHANNEL_MANAGER_PROPERTY_ID_INVALID"
		)
		if (this.synthetic) return this.syntheticRatePlans(propertyId)
		const result = await this.client.paginate({
			path: "/rate_plans",
			query: { "filter[property_id]": propertyId },
			itemSchema: ratePlanResourceSchema,
		})
		return {
			items: result.items.map((row) => ({
				id: row.id,
				name: row.attributes.title ?? row.attributes.name ?? `Tarifa ${row.id}`,
				propertyId:
					row.attributes.property_id ?? row.relationships?.property?.data?.id ?? propertyId,
				roomTypeId: row.attributes.room_type_id ?? row.relationships?.room_type?.data?.id ?? null,
				currency: row.attributes.currency ?? null,
				derived:
					booleanValue(row.attributes.inherit_rate) || Boolean(row.attributes.parent_rate_plan_id),
				readOnly: booleanValue(row.attributes.read_only),
			})),
			fetchedAt: new Date(),
			...meta(result),
		}
	}

	async pushAvailability(input: {
		values: ChannelManagerAvailabilityUpdate[]
	}): Promise<ChannelManagerMutationResult> {
		const values = parseAdapterInput(
			z.array(availabilityValueSchema).min(1),
			input.values,
			"CHANNEL_MANAGER_AVAILABILITY_INVALID"
		)
		if (this.synthetic) return this.syntheticMutation(values.length)
		const response = await this.client.request({
			method: "POST",
			path: "/availability",
			body: {
				values: values.map((value) => ({
					property_id: value.propertyId,
					room_type_id: value.roomTypeId,
					date: value.date,
					date_from: value.dateFrom,
					date_to: value.dateTo,
					days: value.days,
					availability: value.availability,
				})),
			},
		})
		return mutationResult(values.length, response)
	}

	async pushRatesAndRestrictions(input: {
		values: ChannelManagerRateRestrictionUpdate[]
	}): Promise<ChannelManagerMutationResult> {
		const values = parseAdapterInput(
			z.array(restrictionValueSchema).min(1),
			input.values,
			"CHANNEL_MANAGER_RESTRICTIONS_INVALID"
		)
		if (this.synthetic) return this.syntheticMutation(values.length)
		const response = await this.client.request({
			method: "POST",
			path: "/restrictions",
			body: {
				values: values.map((value) => ({
					property_id: value.propertyId,
					rate_plan_id: value.ratePlanId,
					date: value.date,
					date_from: value.dateFrom,
					date_to: value.dateTo,
					days: value.days,
					rate: value.rate,
					min_stay_arrival: value.minStayArrival,
					min_stay_through: value.minStayThrough,
					min_stay: value.minStay,
					max_stay: value.maxStay,
					closed_to_arrival: value.closedToArrival,
					closed_to_departure: value.closedToDeparture,
					stop_sell: value.stopSell,
				})),
			},
		})
		return mutationResult(values.length, response)
	}

	async fetchBookingRevisions(
		input: {
			propertyId?: string | null
		} = {}
	): Promise<ChannelManagerListResult<ChannelManagerBookingRevision>> {
		if (this.synthetic) {
			return { items: [], fetchedAt: new Date(), ...meta({ requestIds: ["test"], warnings: [] }) }
		}
		const result = await this.client.paginate({
			path: "/booking_revisions/feed",
			query: {
				"filter[property_id]": input.propertyId,
				"order[inserted_at]": "asc",
			},
			itemSchema: bookingRevisionResourceSchema,
		})
		return {
			items: result.items.map((row) => ({
				id: row.id,
				propertyId: row.attributes.property_id,
				bookingId: row.attributes.booking_id,
				uniqueId: row.attributes.unique_id ?? null,
				status: row.attributes.status,
				arrivalDate: row.attributes.arrival_date ?? null,
				departureDate: row.attributes.departure_date ?? null,
				insertedAt: row.attributes.inserted_at ?? null,
				otaName: row.attributes.ota_name ?? null,
				otaReservationCode: row.attributes.ota_reservation_code ?? null,
				amount: row.attributes.amount ?? null,
				currency: row.attributes.currency ?? null,
				notes: row.attributes.notes ?? null,
				paymentCollect: row.attributes.payment_collect ?? null,
				paymentType: row.attributes.payment_type ?? null,
				customer: row.attributes.customer
					? {
							name: row.attributes.customer.name ?? null,
							surname: row.attributes.customer.surname ?? null,
							email: row.attributes.customer.email ?? row.attributes.customer.mail ?? null,
							phone: row.attributes.customer.phone ?? null,
						}
					: null,
				occupancy: row.attributes.occupancy ?? null,
				rooms: row.attributes.rooms.map((room) => ({
					roomTypeId: room.room_type_id ?? null,
					ratePlanId: room.rate_plan_id ?? null,
					parentRatePlanId: room.meta?.parent_rate_plan_id ?? null,
					checkinDate: room.checkin_date ?? null,
					checkoutDate: room.checkout_date ?? null,
					amount: room.amount ?? null,
					occupancy: room.occupancy ?? null,
				})),
			})),
			fetchedAt: new Date(),
			...meta(result),
		}
	}

	async acknowledgeBookingRevision(input: {
		revisionId: string
	}): Promise<ChannelManagerMutationResult> {
		const revisionId = parseAdapterInput(
			z.string().min(1),
			input.revisionId,
			"CHANNEL_MANAGER_BOOKING_REVISION_ID_INVALID"
		)
		if (this.synthetic) {
			return {
				ok: true,
				submitted: 1,
				accepted: 1,
				rejected: 0,
				taskIds: ["test-booking-ack"],
				...meta({ requestIds: ["test"], warnings: [] }),
			}
		}
		const response = await this.client.request({
			method: "POST",
			path: `/booking_revisions/${encodeURIComponent(revisionId)}/ack`,
			body: {},
		})
		return mutationResult(1, response)
	}

	async testAccess(
		input: { propertyId?: string | null } = {}
	): Promise<ChannelManagerAccessResult> {
		if (this.synthetic) {
			return {
				ok: true,
				latencyMs: 1,
				message: "Channex test harness OK.",
				...meta({ requestIds: ["test"], warnings: [] }),
			}
		}
		const path = input.propertyId
			? `/properties/${encodeURIComponent(input.propertyId)}`
			: "/properties/"
		const response = await this.client.request({
			method: "GET",
			path,
			query: input.propertyId ? undefined : { "pagination[page]": 1, "pagination[limit]": 1 },
		})
		const rows = Array.isArray(response.data) ? response.data : [response.data]
		const valid = rows.filter((row) => propertyResourceSchema.safeParse(row).success)
		if (
			(input.propertyId && !valid.length) ||
			(!input.propertyId && !Array.isArray(response.data))
		) {
			throw new ChannelManagerAdapterError({
				kind: "invalid_response",
				message: "CHANNEX_ACCESS_RESPONSE_INVALID",
				requestId: response.requestId,
				details: response.data,
			})
		}
		return {
			ok: response.warnings.length === 0,
			latencyMs: response.latencyMs,
			message:
				response.warnings.length > 0
					? "Channex respondió, pero reportó advertencias de acceso."
					: "Acceso a Channex validado.",
			...meta({ requestIds: [response.requestId], warnings: response.warnings }),
		}
	}

	private syntheticProperties(): ChannelManagerListResult<ChannelManagerProperty> {
		return {
			items: [
				{
					id: "channex_property_1",
					name: "Hotel de prueba Channex",
					city: "Santiago",
					country: "CL",
					currency: "USD",
					timezone: "America/Santiago",
					active: true,
				},
			],
			fetchedAt: new Date(),
			...meta({ requestIds: ["test"], warnings: [] }),
		}
	}

	private syntheticRoomTypes(propertyId: string): ChannelManagerListResult<ChannelManagerRoomType> {
		return {
			items: [
				{
					id: "cx_room_twin",
					name: "Twin Room",
					propertyId,
					units: 6,
					maxAdults: 2,
					maxChildren: 0,
				},
			],
			fetchedAt: new Date(),
			...meta({ requestIds: ["test"], warnings: [] }),
		}
	}

	private syntheticRatePlans(propertyId: string): ChannelManagerListResult<ChannelManagerRatePlan> {
		return {
			items: [
				{
					id: "cx_rate_bar",
					name: "Best Available Rate",
					propertyId,
					roomTypeId: "cx_room_twin",
					currency: "USD",
					derived: false,
					readOnly: false,
				},
			],
			fetchedAt: new Date(),
			...meta({ requestIds: ["test"], warnings: [] }),
		}
	}

	private syntheticMutation(submitted: number): ChannelManagerMutationResult {
		return {
			ok: true,
			submitted,
			accepted: submitted,
			rejected: 0,
			taskIds: [`test-ari-${crypto.randomUUID()}`],
			...meta({ requestIds: ["test"], warnings: [] }),
		}
	}
}
