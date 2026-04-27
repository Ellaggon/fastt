import { describe, it, expect } from "vitest"
import {
	and,
	Booking,
	BookingPolicySnapshot,
	DailyInventory,
	EffectivePricing,
	Hold,
	RatePlan,
	db,
	eq,
} from "astro:db"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	createPolicyVersionCapa6,
	normalizePolicyResolutionResult,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { resolveEffectiveRules } from "@/modules/rules/public"
import {
	createInventoryHold,
	recomputeEffectiveAvailabilityRange,
} from "@/modules/inventory/public"
import { createBookingFromHold } from "@/modules/booking/public"
import { inventoryHoldRepository } from "@/container"
import { bookingFromHoldRepository } from "@/container/booking.container"
import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import type { HoldPolicySnapshot } from "@/modules/policies/public"
import { materializeSearchUnitRange } from "@/modules/search/public"

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
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

function stayDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	while (cursor < end) {
		out.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

describe("integration/hold policy snapshot", () => {
	it("creates immutable hold snapshot and booking persists the same contract", async () => {
		const destinationId = `dest_hps_${crypto.randomUUID()}`
		const productId = `prod_hps_${crypto.randomUUID()}`
		const variantId = `var_hps_${crypto.randomUUID()}`
		const templateId = `rpt_hps_${crypto.randomUUID()}`
		const ratePlanId = `rp_hps_${crypto.randomUUID()}`
		const checkIn = "2030-02-01"
		const checkOut = "2030-02-03"

		await upsertDestination({
			id: destinationId,
			name: "HPS Dest",
			type: "city",
			country: "CL",
			slug: `hps-${destinationId}`,
		})
		await upsertProduct({
			id: productId,
			name: "HPS Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({ id: variantId, productId, kind: "hotel_room", name: "Room" })
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		for (const date of [...stayDates(checkIn, checkOut), checkOut]) {
			await db.insert(DailyInventory).values({
				id: `di_hps_${crypto.randomUUID()}`,
				variantId,
				date,
				totalInventory: 5,
				reservedCount: 0,
				stopSell: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)
		}

		const paymentPolicy = await createPolicyCapa6({
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
		})
		const cancellationPolicy = await createPolicyCapa6({
			category: "Cancellation",
			description: "Flexible cancellation",
			cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
		} as any)
		const checkInPolicy = await createPolicyCapa6({
			category: "CheckIn",
			description: "Standard check-in",
			rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
		} as any)
		const noShowPolicy = await createPolicyCapa6({
			category: "NoShow",
			description: "No-show first night",
			rules: { penaltyType: "first_night" },
		} as any)
		for (const policy of [paymentPolicy, cancellationPolicy, checkInPolicy, noShowPolicy]) {
			await assignPolicyCapa6({
				policyId: policy.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
				channel: "web",
			})
		}

		const hold = await createInventoryHold(
			{
				repo: inventoryHoldRepository,
				resolveEffectivePolicies: async (ctx) =>
					normalizePolicyResolutionResult(await resolveEffectivePolicies(ctx), {
						asOfDate: String(ctx.checkIn ?? "2030-01-01"),
						warnings: [],
					}).dto,
				resolveEffectiveRules: (ctx) => resolveEffectiveRules(ctx),
				policyContext: {
					productId,
					ratePlanId,
					channel: "web",
				},
				resolvePricingSnapshot: async () => ({
					ratePlanId,
					currency: "USD",
					occupancy: 1,
					from: checkIn,
					to: checkOut,
					nights: 2,
					totalPrice: 200,
					days: [
						{ date: "2030-02-01", price: 100 },
						{ date: "2030-02-02", price: 100 },
					],
				}),
			},
			{
				variantId,
				dateRange: { from: checkIn, to: checkOut },
				occupancy: 1,
				sessionId: `sess_${crypto.randomUUID()}`,
			}
		)

		const holdRow = await db
			.select({ policySnapshotJson: Hold.policySnapshotJson })
			.from(Hold)
			.where(eq(Hold.id, hold.holdId))
			.get()
		expect(holdRow).toBeTruthy()
		const holdSnapshot = holdRow?.policySnapshotJson as HoldPolicySnapshot
		expect(holdSnapshot.meta.checkIn).toBe(checkIn)
		expect(holdSnapshot.meta.checkOut).toBe(checkOut)
		expect(holdSnapshot.meta.channel).toBe("web")
		expect(holdSnapshot.payment?.description).toBe("Pay at property")
		expect(holdSnapshot.ruleBasedContractSnapshot).toBeTruthy()
		expect(holdSnapshot.contractComparisonJson).toBeTruthy()
		expect(holdSnapshot.contractComparisonJson?.isConsistent).toBe(true)

		await createPolicyVersionCapa6({
			previousPolicyId: paymentPolicy.policyId,
			description: "Prepayment required",
			rules: { paymentType: "prepayment" },
		})

		const booking = await createBookingFromHold(
			{
				repository: bookingFromHoldRepository,
				resolveEffectiveTaxFees: async () => ({ definitions: [] }),
			},
			{
				holdId: hold.holdId,
				userId: null,
				source: "web",
			}
		)

		const bookingPolicyRows = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, booking.bookingId))
			.all()
		expect(bookingPolicyRows.length).toBeGreaterThan(0)

		const paymentRow = bookingPolicyRows.find(
			(row: any) => String(row.category) === "payment"
		) as any
		expect(paymentRow).toBeTruthy()
		expect(String(paymentRow.description)).toBe("Pay at property")
		expect(String(paymentRow.policyId)).toBe(String(holdSnapshot.payment?.policyId ?? ""))
		expect(paymentRow.policySnapshotJson).toEqual(holdSnapshot.payment)

		const holdRowAfter = await db
			.select({ policySnapshotJson: Hold.policySnapshotJson })
			.from(Hold)
			.where(and(eq(Hold.id, hold.holdId), eq(Hold.variantId, variantId)))
			.get()
		expect(holdRowAfter?.policySnapshotJson).toEqual(holdSnapshot)
	})

	it("stores rule validation trace in snapshot when debug flag is enabled", async () => {
		const previousDebug = process.env.RULE_SNAPSHOT_VALIDATION_DEBUG
		process.env.RULE_SNAPSHOT_VALIDATION_DEBUG = "1"
		try {
			const destinationId = `dest_hps_dbg_${crypto.randomUUID()}`
			const productId = `prod_hps_dbg_${crypto.randomUUID()}`
			const variantId = `var_hps_dbg_${crypto.randomUUID()}`
			const templateId = `rpt_hps_dbg_${crypto.randomUUID()}`
			const ratePlanId = `rp_hps_dbg_${crypto.randomUUID()}`
			const checkIn = "2030-02-21"
			const checkOut = "2030-02-23"

			await upsertDestination({
				id: destinationId,
				name: "HPS Debug Dest",
				type: "city",
				country: "CL",
				slug: `hps-dbg-${destinationId}`,
			})
			await upsertProduct({
				id: productId,
				name: "HPS Debug Product",
				productType: "Hotel",
				destinationId,
			})
			await upsertVariant({ id: variantId, productId, kind: "hotel_room", name: "Room" })
			await upsertRatePlanTemplate({
				id: templateId,
				name: "Default",
				paymentType: "pay_at_property",
				refundable: true,
			})
			await upsertRatePlan({
				id: ratePlanId,
				templateId,
				variantId,
				isActive: true,
				isDefault: true,
			})

			for (const date of [...stayDates(checkIn, checkOut), checkOut]) {
				await db.insert(DailyInventory).values({
					id: `di_hps_dbg_${crypto.randomUUID()}`,
					variantId,
					date,
					totalInventory: 5,
					reservedCount: 0,
					stopSell: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				} as any)
			}

			const paymentPolicy = await createPolicyCapa6({
				category: "Payment",
				description: "Pay at property",
				rules: { paymentType: "pay_at_property" },
			})
			const cancellationPolicy = await createPolicyCapa6({
				category: "Cancellation",
				description: "Flexible cancellation",
				cancellationTiers: [
					{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 },
				],
			} as any)
			const checkInPolicy = await createPolicyCapa6({
				category: "CheckIn",
				description: "Standard check-in",
				rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
			} as any)
			const noShowPolicy = await createPolicyCapa6({
				category: "NoShow",
				description: "No-show first night",
				rules: { penaltyType: "first_night" },
			} as any)
			for (const policy of [paymentPolicy, cancellationPolicy, checkInPolicy, noShowPolicy]) {
				await assignPolicyCapa6({
					policyId: policy.policyId,
					scope: "rate_plan",
					scopeId: ratePlanId,
					channel: "web",
				})
			}

			const hold = await createInventoryHold(
				{
					repo: inventoryHoldRepository,
					resolveEffectivePolicies: async (ctx) =>
						normalizePolicyResolutionResult(await resolveEffectivePolicies(ctx), {
							asOfDate: String(ctx.checkIn ?? "2030-01-01"),
							warnings: [],
						}).dto,
					resolveEffectiveRules: (ctx) => resolveEffectiveRules(ctx),
					policyContext: {
						productId,
						ratePlanId,
						channel: "web",
					},
					resolvePricingSnapshot: async () => ({
						ratePlanId,
						currency: "USD",
						occupancy: 1,
						from: checkIn,
						to: checkOut,
						nights: 2,
						totalPrice: 200,
						days: [
							{ date: "2030-02-21", price: 100 },
							{ date: "2030-02-22", price: 100 },
						],
					}),
				},
				{
					variantId,
					dateRange: { from: checkIn, to: checkOut },
					occupancy: 1,
					sessionId: `sess_dbg_${crypto.randomUUID()}`,
				}
			)

			const holdRow = await db
				.select({ policySnapshotJson: Hold.policySnapshotJson })
				.from(Hold)
				.where(eq(Hold.id, hold.holdId))
				.get()
			const snapshot = holdRow?.policySnapshotJson as HoldPolicySnapshot
			expect(snapshot.ruleValidationJson).toBeTruthy()
			expect(snapshot.ruleValidationJson?.isConsistent).toBe(true)
		} finally {
			if (previousDebug === undefined) delete process.env.RULE_SNAPSHOT_VALIDATION_DEBUG
			else process.env.RULE_SNAPSHOT_VALIDATION_DEBUG = previousDebug
		}
	})

	it("enforces ratePlan context and keeps hold->booking contract aligned to selected rate plan", async () => {
		const token = "t_hold_ctx"
		const email = "hold-ctx@example.com"
		const destinationId = `dest_hps_ctx_${crypto.randomUUID()}`
		const productId = `prod_hps_ctx_${crypto.randomUUID()}`
		const variantId = `var_hps_ctx_${crypto.randomUUID()}`
		const templateId = `rpt_hps_ctx_${crypto.randomUUID()}`
		const ratePlanIdA = `rp_hps_ctx_a_${crypto.randomUUID()}`
		const ratePlanIdB = `rp_hps_ctx_b_${crypto.randomUUID()}`
		const checkIn = "2030-03-10"
		const checkOut = "2030-03-12"

		await upsertDestination({
			id: destinationId,
			name: "HPS Ctx Dest",
			type: "city",
			country: "CL",
			slug: `hps-ctx-${destinationId}`,
		})
		await upsertProduct({
			id: productId,
			name: "HPS Ctx Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({ id: variantId, productId, kind: "hotel_room", name: "Room" })
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanIdA,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
		})
		await db
			.insert(RatePlan)
			.values({
				id: ratePlanIdB,
				templateId,
				variantId,
				isActive: true,
				isDefault: false,
				createdAt: new Date(),
			} as any)
			.run()

		for (const date of stayDates(checkIn, checkOut)) {
			await db.insert(DailyInventory).values({
				id: `di_ctx_${crypto.randomUUID()}`,
				variantId,
				date,
				totalInventory: 3,
				reservedCount: 0,
				stopSell: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)
			await db
				.insert(EffectivePricing)
				.values({
					id: `ep_ctx_a_${date}_${crypto.randomUUID()}`,
					variantId,
					ratePlanId: ratePlanIdA,
					date,
					basePrice: 100,
					yieldMultiplier: 1,
					finalBasePrice: 100,
					computedAt: new Date(),
				} as any)
				.run()
			await db
				.insert(EffectivePricing)
				.values({
					id: `ep_ctx_b_${date}_${crypto.randomUUID()}`,
					variantId,
					ratePlanId: ratePlanIdB,
					date,
					basePrice: 120,
					yieldMultiplier: 1,
					finalBasePrice: 120,
					computedAt: new Date(),
				} as any)
				.run()
		}

		const createPolicySetForRatePlan = async (ratePlanId: string, paymentDescription: string) => {
			const cancellation = await createPolicyCapa6({
				category: "Cancellation",
				description: "Flexible cancellation",
				cancellationTiers: [
					{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 },
				],
			} as any)
			const payment = await createPolicyCapa6({
				category: "Payment",
				description: paymentDescription,
				rules: { paymentType: "pay_at_property" },
			} as any)
			const checkIn = await createPolicyCapa6({
				category: "CheckIn",
				description: "Standard check-in",
				rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
			} as any)
			const noShow = await createPolicyCapa6({
				category: "NoShow",
				description: "No-show first night",
				rules: { penaltyType: "first_night" },
			} as any)
			for (const policy of [cancellation, payment, checkIn, noShow]) {
				await assignPolicyCapa6({
					policyId: policy.policyId,
					scope: "rate_plan",
					scopeId: ratePlanId,
					channel: "web",
				})
			}
			return { paymentPolicyId: payment.policyId }
		}

		await createPolicySetForRatePlan(ratePlanIdA, "Pay at property A")
		const ratePlanBPolicies = await createPolicySetForRatePlan(ratePlanIdB, "Pay at property B")

		await recomputeEffectiveAvailabilityRange({
			variantId,
			from: checkIn,
			to: checkOut,
			reason: "test_hold_policy_snapshot",
			idempotencyKey: `test_hold_policy_snapshot:${variantId}:${checkIn}:${checkOut}`,
		})

		await materializeSearchUnitRange({
			variantId,
			ratePlanId: ratePlanIdA,
			from: checkIn,
			to: addDays(checkOut, 1),
			currency: "USD",
		})
		await materializeSearchUnitRange({
			variantId,
			ratePlanId: ratePlanIdB,
			from: checkIn,
			to: addDays(checkOut, 1),
			currency: "USD",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_ctx", email } }, async () => {
			const invalid = new FormData()
			invalid.set("variantId", variantId)
			invalid.set("checkIn", checkIn)
			invalid.set("checkOut", checkOut)
			invalid.set("quantity", "1")
			const invalidRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: invalid }),
			} as any)
			expect(invalidRes.status).toBe(400)

			const form = new FormData()
			form.set("variantId", variantId)
			form.set("ratePlanId", ratePlanIdB)
			form.set("checkIn", checkIn)
			form.set("checkOut", checkOut)
			form.set("quantity", "1")
			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form }),
			} as any)
			expect(holdRes.status).toBe(200)
			const holdBody = (await readJson(holdRes)) as any
			const holdId = String(holdBody?.holdId ?? "")
			expect(holdId.length).toBeGreaterThan(0)

			const holdRow = await db.select().from(Hold).where(eq(Hold.id, holdId)).get()
			expect(String((holdRow as any)?.ratePlanId ?? "")).toBe(ratePlanIdB)
			const holdSnapshot = (holdRow as any)?.policySnapshotJson as HoldPolicySnapshot
			expect(String(holdSnapshot?.payment?.policyId ?? "")).toBe(ratePlanBPolicies.paymentPolicyId)

			const confirm = new FormData()
			confirm.set("holdId", holdId)
			const confirmRes = await bookingConfirmPost({
				request: makeAuthedFormRequest({ path: "/api/booking/confirm", token, form: confirm }),
			} as any)
			expect(confirmRes.status).toBe(200)
			const confirmBody = (await readJson(confirmRes)) as any
			const bookingId = String(confirmBody?.bookingId ?? "")
			expect(bookingId.length).toBeGreaterThan(0)

			const bookingRow = await db.select().from(Booking).where(eq(Booking.id, bookingId)).get()
			expect(String((bookingRow as any)?.ratePlanId ?? "")).toBe(ratePlanIdB)

			const bookingPolicyRows = await db
				.select()
				.from(BookingPolicySnapshot)
				.where(eq(BookingPolicySnapshot.bookingId, bookingId))
				.all()
			const paymentRow = bookingPolicyRows.find(
				(row: any) => String(row.category) === "payment"
			) as any
			expect(paymentRow).toBeTruthy()
			expect(String(paymentRow.policyId)).toBe(ratePlanBPolicies.paymentPolicyId)
			expect(paymentRow.policySnapshotJson).toEqual(holdSnapshot.payment)
		})
	})
})
