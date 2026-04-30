import { describe, expect, it } from "vitest"

import {
	and,
	Booking,
	DailyInventory,
	db,
	EffectivePricingV2,
	eq,
	FinancialShadowRecord,
	InventoryLock,
	RatePlan,
	RatePlanTemplate,
	Variant,
} from "astro:db"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { GET as reconciliationGet } from "@/pages/api/internal/financial/reconciliation"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { assignPolicyCapa6, createPolicyCapa6 } from "@/modules/policies/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function makeAuthedFormRequest(params: { path: string; token?: string; form: FormData }): Request {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

async function readJson<T = any>(res: Response): Promise<T> {
	const txt = await res.text()
	return txt ? (JSON.parse(txt) as T) : (null as T)
}

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

async function seedBookingReadyVariant(params: {
	productId: string
	providerId: string
	variantId: string
	ratePlanId: string
	totalUnits: number
	dates: string[]
}) {
	const destinationId = `dest_finrec_${crypto.randomUUID()}`
	const templateId = `rpt_finrec_${crypto.randomUUID()}`

	await upsertDestination({
		id: destinationId,
		name: "Financial Reconciliation Destination",
		type: "city",
		country: "CL",
		slug: `finrec-${destinationId}`,
	})

	await upsertProvider({
		id: params.providerId,
		displayName: "Financial Reconciliation Provider",
		ownerEmail: `owner+${params.providerId}@example.com`,
	})

	await upsertProduct({
		id: params.productId,
		name: "Financial Reconciliation Product",
		productType: "Hotel",
		destinationId,
		providerId: params.providerId,
	})

	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Financial Reconciliation Room",
		isActive: true,
		currency: "USD",
		basePrice: 100,
	})

	await db
		.update(Variant)
		.set({
			status: "ready",
		} as any)
		.where(and(eq(Variant.id, params.variantId), eq(Variant.productId, params.productId)))

	await db.insert(RatePlanTemplate).values({
		id: templateId,
		name: "Default",
		paymentType: "pay_at_property",
		refundable: true,
		createdAt: new Date(),
	} as any)

	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		templateId,
		variantId: params.variantId,
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	const cancellation = await createPolicyCapa6({
		category: "Cancellation",
		description: "Flexible cancellation",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	} as any)
	const payment = await createPolicyCapa6({
		category: "Payment",
		description: "Pay at property",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		rules: { paymentType: "pay_at_property" },
	} as any)
	const checkIn = await createPolicyCapa6({
		category: "CheckIn",
		description: "Standard check-in",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		category: "NoShow",
		description: "No-show first night",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		rules: { penaltyType: "first_night" },
	} as any)
	for (const policy of [cancellation, payment, checkIn, noShow]) {
		await assignPolicyCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: "web",
		})
	}

	for (const date of params.dates) {
		await db.insert(DailyInventory).values({
			id: `di_finrec_${crypto.randomUUID()}`,
			variantId: params.variantId,
			date,
			totalInventory: params.totalUnits,
			reservedCount: 0,
			stopSell: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)

		await db
			.insert(EffectivePricingV2)
			.values({
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				date,
				occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
				baseComponent: 100,
				finalBasePrice: 100,

				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [
					EffectivePricingV2.variantId,
					EffectivePricingV2.ratePlanId,
					EffectivePricingV2.date,
					EffectivePricingV2.occupancyKey,
				],
				set: {
					baseComponent: 100,
					finalBasePrice: 100,

					computedAt: new Date(),
				},
			})
	}

	const from = params.dates[0]
	const to = addDays(params.dates[params.dates.length - 1], 1)
	for (const adults of [1, 2]) {
		await ensurePricingCoverageForRequestRuntime({
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			checkIn: from,
			checkOut: to,
			occupancy: { adults, children: 0, infants: 0 },
		})
	}
	await recomputeEffectiveAvailabilityRange({
		variantId: params.variantId,
		from,
		to,
		reason: "financial_reconciliation_seed",
		idempotencyKey: `financial_reconciliation_seed:${params.variantId}`,
	})
	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from,
		to,
		currency: "USD",
	})
}

async function createHold(params: {
	token: string
	variantId: string
	ratePlanId: string
	checkIn: string
	checkOut: string
}) {
	const holdForm = new FormData()
	holdForm.set("variantId", params.variantId)
	holdForm.set("ratePlanId", params.ratePlanId)
	holdForm.set("checkIn", params.checkIn)
	holdForm.set("checkOut", params.checkOut)
	holdForm.set("quantity", "1")

	const holdRes = await holdPost({
		request: makeAuthedFormRequest({
			path: "/api/inventory/hold",
			token: params.token,
			form: holdForm,
		}),
	} as any)
	expect(holdRes.status).toBe(200)
	const holdBody = await readJson<{ holdId?: string }>(holdRes)
	const holdId = String(holdBody?.holdId ?? "")
	expect(holdId.length).toBeGreaterThan(0)
	return holdId
}

async function confirmBooking(params: {
	token: string
	holdId: string
	enableFinancialShadow: boolean
}) {
	const confirmForm = new FormData()
	confirmForm.set("holdId", params.holdId)
	const path = params.enableFinancialShadow
		? "/api/booking/confirm?FINANCIAL_SHADOW_WRITE=1"
		: "/api/booking/confirm?FINANCIAL_SHADOW_WRITE=0"
	const res = await bookingConfirmPost({
		request: makeAuthedFormRequest({ path, token: params.token, form: confirmForm }),
	} as any)
	expect(res.status).toBe(200)
	const body = await readJson<{ bookingId?: string; status?: string }>(res)
	const bookingId = String(body?.bookingId ?? "")
	expect(bookingId.length).toBeGreaterThan(0)
	return bookingId
}

async function callReconciliation(bookingId: string) {
	const response = await reconciliationGet({
		url: new URL(
			`http://localhost:4321/api/internal/financial/reconciliation?bookingId=${bookingId}`
		),
	} as any)
	expect(response.status).toBe(200)
	return readJson<any>(response)
}

describe("integration/financial reconciliation", () => {
	it("Case 1: returns ok on happy path with financial shadow write enabled", async () => {
		const token = "t_finrec_happy"
		const email = "finrec-happy@example.com"
		const providerId = `prov_finrec_happy_${crypto.randomUUID()}`
		const productId = `prod_finrec_happy_${crypto.randomUUID()}`
		const variantId = `var_finrec_happy_${crypto.randomUUID()}`
		const ratePlanId = `rp_finrec_happy_${crypto.randomUUID()}`
		const checkIn = "2026-06-10"
		const checkOut = "2026-06-12"

		await seedBookingReadyVariant({
			productId,
			providerId,
			variantId,
			ratePlanId,
			totalUnits: 2,
			dates: ["2026-06-10", "2026-06-11", "2026-06-12"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_finrec_happy", email } }, async () => {
			const holdId = await createHold({ token, variantId, ratePlanId, checkIn, checkOut })
			const bookingId = await confirmBooking({ token, holdId, enableFinancialShadow: true })
			const payload = await callReconciliation(bookingId)

			expect(payload.reconciliation.status).toBe("ok")
			expect(payload.booking.bookingId).toBe(bookingId)
			expect(Number(payload.booking.finalTotal)).toBeGreaterThan(0)
			expect(payload.booking.currency).toBe("USD")
			expect(payload.financial.paymentIntents.length).toBe(1)
			expect(payload.financial.settlementRecords.length).toBe(1)
			expect(Number(payload.financial.paymentIntents[0].amount)).toBe(
				Number(payload.booking.finalTotal)
			)
		})
	})

	it("Case 2: returns missing when shadow write is disabled", async () => {
		const token = "t_finrec_missing"
		const email = "finrec-missing@example.com"
		const providerId = `prov_finrec_missing_${crypto.randomUUID()}`
		const productId = `prod_finrec_missing_${crypto.randomUUID()}`
		const variantId = `var_finrec_missing_${crypto.randomUUID()}`
		const ratePlanId = `rp_finrec_missing_${crypto.randomUUID()}`
		const checkIn = "2026-07-03"
		const checkOut = "2026-07-05"

		await seedBookingReadyVariant({
			productId,
			providerId,
			variantId,
			ratePlanId,
			totalUnits: 2,
			dates: ["2026-07-03", "2026-07-04", "2026-07-05"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_finrec_missing", email } }, async () => {
			const holdId = await createHold({ token, variantId, ratePlanId, checkIn, checkOut })
			const bookingId = await confirmBooking({ token, holdId, enableFinancialShadow: false })
			const payload = await callReconciliation(bookingId)

			expect(payload.reconciliation.status).toBe("missing")
			expect(payload.financial.paymentIntents.length).toBe(0)
			expect(payload.financial.settlementRecords.length).toBe(0)
		})
	})

	it("Case 3: returns mismatch when financial amount diverges from booking total", async () => {
		const token = "t_finrec_mismatch"
		const email = "finrec-mismatch@example.com"
		const providerId = `prov_finrec_mismatch_${crypto.randomUUID()}`
		const productId = `prod_finrec_mismatch_${crypto.randomUUID()}`
		const variantId = `var_finrec_mismatch_${crypto.randomUUID()}`
		const ratePlanId = `rp_finrec_mismatch_${crypto.randomUUID()}`
		const checkIn = "2026-08-10"
		const checkOut = "2026-08-12"

		await seedBookingReadyVariant({
			productId,
			providerId,
			variantId,
			ratePlanId,
			totalUnits: 2,
			dates: ["2026-08-10", "2026-08-11", "2026-08-12"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_finrec_mismatch", email } }, async () => {
			const holdId = await createHold({ token, variantId, ratePlanId, checkIn, checkOut })
			const bookingId = await confirmBooking({ token, holdId, enableFinancialShadow: true })

			const paymentRow = await db
				.select({
					id: FinancialShadowRecord.id,
					payload: FinancialShadowRecord.payload,
				})
				.from(FinancialShadowRecord)
				.where(
					and(
						eq(FinancialShadowRecord.bookingId, bookingId),
						eq(FinancialShadowRecord.type, "payment_intent")
					)
				)
				.get()
			expect(paymentRow).toBeTruthy()
			const payload = (paymentRow?.payload ?? {}) as Record<string, unknown>

			await db
				.update(FinancialShadowRecord)
				.set({
					payload: {
						...payload,
						amount: Number(payload.amount ?? 0) + 7.25,
					},
				} as any)
				.where(eq(FinancialShadowRecord.id, String(paymentRow?.id)))
				.run()

			const reconciled = await callReconciliation(bookingId)
			expect(reconciled.reconciliation.status).toBe("mismatch")
		})
	})

	it("Case 4: remains idempotent on double booking confirm and keeps reconciliation ok", async () => {
		const token = "t_finrec_idempotent"
		const email = "finrec-idempotent@example.com"
		const providerId = `prov_finrec_idempotent_${crypto.randomUUID()}`
		const productId = `prod_finrec_idempotent_${crypto.randomUUID()}`
		const variantId = `var_finrec_idempotent_${crypto.randomUUID()}`
		const ratePlanId = `rp_finrec_idempotent_${crypto.randomUUID()}`
		const checkIn = "2026-09-01"
		const checkOut = "2026-09-03"

		await seedBookingReadyVariant({
			productId,
			providerId,
			variantId,
			ratePlanId,
			totalUnits: 2,
			dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_finrec_idempotent", email } }, async () => {
			const holdId = await createHold({ token, variantId, ratePlanId, checkIn, checkOut })
			const confirmForm = new FormData()
			confirmForm.set("holdId", holdId)
			const path = "/api/booking/confirm?FINANCIAL_SHADOW_WRITE=1"
			const confirmOnce = async () =>
				bookingConfirmPost({
					request: makeAuthedFormRequest({ path, token, form: confirmForm }),
				} as any)

			const [resA, resB] = await Promise.all([confirmOnce(), confirmOnce()])
			expect(resA.status).toBe(200)
			expect(resB.status).toBe(200)

			const bodyA = await readJson<{ bookingId?: string }>(resA)
			const bodyB = await readJson<{ bookingId?: string }>(resB)
			const bookingId = String(bodyA.bookingId ?? "")
			expect(bookingId.length).toBeGreaterThan(0)
			expect(String(bodyB.bookingId ?? "")).toBe(bookingId)

			const lockRows = await db
				.select()
				.from(InventoryLock)
				.where(eq(InventoryLock.holdId, holdId))
				.all()
			expect(lockRows.length).toBe(2)
			expect(lockRows.every((row: any) => String(row.bookingId ?? "") === bookingId)).toBe(true)

			const financialRows = await db
				.select({
					id: FinancialShadowRecord.id,
					type: FinancialShadowRecord.type,
					idempotencyKey: FinancialShadowRecord.idempotencyKey,
				})
				.from(FinancialShadowRecord)
				.where(eq(FinancialShadowRecord.bookingId, bookingId))
				.all()
			expect(financialRows.filter((row) => row.type === "payment_intent")).toHaveLength(1)
			expect(financialRows.filter((row) => row.type === "settlement_record")).toHaveLength(1)
			const uniqueKeys = new Set(financialRows.map((row) => String(row.idempotencyKey ?? "")))
			expect(uniqueKeys.size).toBe(financialRows.length)

			const bookingRows = await db.select().from(Booking).where(eq(Booking.id, bookingId)).all()
			expect(bookingRows).toHaveLength(1)

			const reconciled = await callReconciliation(bookingId)
			expect(reconciled.reconciliation.status).toBe("ok")
		})
	})
})
