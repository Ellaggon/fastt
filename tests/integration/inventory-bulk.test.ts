import { describe, it, expect, vi } from "vitest"

import { and, db, DailyInventory, eq } from "astro:db"

import { POST as bulkPreviewPost } from "@/pages/api/inventory/bulk-preview"
import { POST as bulkApplyPost } from "@/pages/api/inventory/bulk-apply"
import {
	applyBulkInventoryOperation,
	simulateBulkInventoryOperation,
} from "@/modules/inventory/public"
import { DailyInventoryRepository } from "@/modules/inventory/infrastructure/repositories/DailyInventoryRepository"
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

function makeAuthedJsonRequest(params: {
	path: string
	token?: string
	body: Record<string, unknown>
}): Request {
	const headers = new Headers({ "Content-Type": "application/json" })
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(params.body),
	})
}

function makeAuthedRequest(params: { path: string; token?: string; method?: string }): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: params.method ?? "GET",
		headers,
	})
}

async function readJson(response: Response) {
	const text = await response.text()
	return text ? JSON.parse(text) : null
}

async function seedVariantOwnedByProvider(params: {
	email: string
	providerId: string
	productId: string
	variantId: string
}) {
	const destinationId = `dest_inv_bulk_${crypto.randomUUID()}`
	await upsertDestination({
		id: destinationId,
		name: "Dest Bulk Inventory",
		type: "city",
		country: "CL",
		slug: `dest-bulk-inv-${destinationId}`,
	})
	await upsertProvider({ id: params.providerId, displayName: "Prov", ownerEmail: params.email })
	await upsertProduct({
		id: params.productId,
		name: "Hotel Bulk Inventory",
		productType: "Hotel",
		destinationId,
		providerId: params.providerId,
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Room Bulk",
	})
}

async function upsertDailyRow(params: {
	variantId: string
	date: string
	totalInventory: number
	stopSell: boolean
}) {
	await db
		.insert(DailyInventory)
		.values({
			id: `di_${crypto.randomUUID()}`,
			variantId: params.variantId,
			date: params.date,
			totalInventory: params.totalInventory,
			reservedCount: 0,
			stopSell: params.stopSell,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)
		.onConflictDoUpdate({
			target: [DailyInventory.variantId, DailyInventory.date],
			set: {
				totalInventory: params.totalInventory,
				stopSell: params.stopSell,
				updatedAt: new Date(),
			},
		})
}

async function getDailyRow(variantId: string, date: string) {
	return db
		.select()
		.from(DailyInventory)
		.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, date)))
		.get()
}

describe("integration/inventory bulk operations", () => {
	it("bulk preview does not persist changes", async () => {
		const token = "t_inv_bulk_preview"
		const email = "inv-bulk-preview@example.com"
		const providerId = `prov_inv_bulk_preview_${crypto.randomUUID()}`
		const productId = `prod_inv_bulk_preview_${crypto.randomUUID()}`
		const variantId = `var_inv_bulk_preview_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })
		await upsertDailyRow({
			variantId,
			date: "2026-03-10",
			totalInventory: 2,
			stopSell: false,
		})
		await upsertDailyRow({
			variantId,
			date: "2026-03-11",
			totalInventory: 2,
			stopSell: false,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_inv_bulk_preview", email } }, async () => {
			const response = await bulkPreviewPost({
				request: makeAuthedJsonRequest({
					path: "/api/inventory/bulk-preview",
					token,
					body: {
						variantId,
						dateFrom: "2026-03-10",
						dateTo: "2026-03-12",
						operation: { type: "set_inventory", value: 5 },
					},
				}),
			} as any)
			expect(response.status).toBe(200)
			const payload = await readJson(response)
			expect(payload?.mode).toBe("preview")
			expect(Number(payload?.summary?.changedDays)).toBeGreaterThan(0)
		})

		const row = await getDailyRow(variantId, "2026-03-10")
		expect(Number((row as any)?.totalInventory)).toBe(2)
	})

	it("bulk apply updates only selected weekday subset", async () => {
		const token = "t_inv_bulk_apply_weekday"
		const email = "inv-bulk-apply-weekday@example.com"
		const providerId = `prov_inv_bulk_apply_weekday_${crypto.randomUUID()}`
		const productId = `prod_inv_bulk_apply_weekday_${crypto.randomUUID()}`
		const variantId = `var_inv_bulk_apply_weekday_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })
		for (const date of ["2026-03-09", "2026-03-10", "2026-03-11"]) {
			await upsertDailyRow({
				variantId,
				date,
				totalInventory: 3,
				stopSell: false,
			})
		}

		await withSupabaseAuthStub({ [token]: { id: "u_inv_bulk_apply_weekday", email } }, async () => {
			const response = await bulkApplyPost({
				request: makeAuthedJsonRequest({
					path: "/api/inventory/bulk-apply",
					token,
					body: {
						variantId,
						dateFrom: "2026-03-09",
						dateTo: "2026-03-12",
						daysOfWeek: [1], // Monday only (UTC)
						operation: { type: "set_inventory", value: 6 },
					},
				}),
			} as any)
			expect(response.status).toBe(200)
			const payload = await readJson(response)
			expect(payload?.mode).toBe("apply")
			expect(Number(payload?.summary?.targetDays)).toBe(1)
			expect(Number(payload?.summary?.successfulDays)).toBe(1)
			expect(Number(payload?.summary?.failedDays)).toBe(0)
		})

		const monday = await getDailyRow(variantId, "2026-03-09")
		const tuesday = await getDailyRow(variantId, "2026-03-10")
		expect(Number((monday as any)?.totalInventory)).toBe(6)
		expect(Number((tuesday as any)?.totalInventory)).toBe(3)
	})

	it("bulk apply reports partial errors without aborting whole range", async () => {
		const token = "t_inv_bulk_partial"
		const email = "inv-bulk-partial@example.com"
		const providerId = `prov_inv_bulk_partial_${crypto.randomUUID()}`
		const productId = `prod_inv_bulk_partial_${crypto.randomUUID()}`
		const variantId = `var_inv_bulk_partial_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })
		await upsertDailyRow({
			variantId,
			date: "2026-03-10",
			totalInventory: 2,
			stopSell: false,
		})
		await upsertDailyRow({
			variantId,
			date: "2026-03-11",
			totalInventory: 2,
			stopSell: false,
		})

		const originalUpsert = DailyInventoryRepository.prototype.upsertOperational
		const spy = vi
			.spyOn(DailyInventoryRepository.prototype, "upsertOperational")
			.mockImplementation(async (row: any) => {
				if (String(row?.date) === "2026-03-10") {
					throw new Error("forced_partial_failure")
				}
				return originalUpsert.call(new DailyInventoryRepository(), row)
			})

		try {
			await withSupabaseAuthStub({ [token]: { id: "u_inv_bulk_partial", email } }, async () => {
				const response = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/inventory/bulk-apply",
						token,
						body: {
							variantId,
							dateFrom: "2026-03-10",
							dateTo: "2026-03-12",
							operation: { type: "set_inventory", value: 7 },
						},
					}),
				} as any)
				expect(response.status).toBe(200)
				const payload = await readJson(response)
				expect(Number(payload?.summary?.failedDays)).toBe(1)
				expect(Number(payload?.summary?.successfulDays)).toBeGreaterThanOrEqual(1)
				expect(Array.isArray(payload?.failures)).toBe(true)
				expect(String(payload?.failures?.[0]?.error ?? "")).toContain("forced_partial_failure")
			})
		} finally {
			spy.mockRestore()
		}

		const failedDay = await getDailyRow(variantId, "2026-03-10")
		const successDay = await getDailyRow(variantId, "2026-03-11")
		expect(Number((failedDay as any)?.totalInventory)).toBe(2)
		expect(Number((successDay as any)?.totalInventory)).toBe(7)
	})

	it("v2 supports multi-variant selection and aggregates preview results", async () => {
		const token = "t_inv_bulk_v2_preview"
		const email = "inv-bulk-v2-preview@example.com"
		const providerId = `prov_inv_bulk_v2_preview_${crypto.randomUUID()}`
		const productAId = `prod_inv_bulk_v2_preview_a_${crypto.randomUUID()}`
		const productBId = `prod_inv_bulk_v2_preview_b_${crypto.randomUUID()}`
		const variantAId = `var_inv_bulk_v2_preview_a_${crypto.randomUUID()}`
		const variantBId = `var_inv_bulk_v2_preview_b_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({
			email,
			providerId,
			productId: productAId,
			variantId: variantAId,
		})
		await seedVariantOwnedByProvider({
			email,
			providerId,
			productId: productBId,
			variantId: variantBId,
		})

		for (const variantId of [variantAId, variantBId]) {
			for (const date of ["2026-03-09", "2026-03-10", "2026-03-11"]) {
				await upsertDailyRow({
					variantId,
					date,
					totalInventory: 2,
					stopSell: false,
				})
			}
		}

		await withSupabaseAuthStub({ [token]: { id: "u_inv_bulk_v2_preview", email } }, async () => {
			const result = await simulateBulkInventoryOperation({
				request: makeAuthedRequest({ path: "/internal-test", token }),
				input: {
					selection: { variantIds: [variantAId, variantBId] },
					dateRange: { from: "2026-03-09", to: "2026-03-12" },
					filters: { daysOfWeek: ["MON"] },
					operation: { type: "SET_INVENTORY", value: 9 },
					context: { source: "test_v2_preview" },
				},
			})

			expect(result.mode).toBe("preview")
			expect(result.context?.mode).toBe("v2")
			expect(result.units?.length).toBe(2)
			expect(Number(result.summaryAggregated?.variantsTotal ?? 0)).toBe(2)
			expect(Number(result.summaryAggregated?.targetDays ?? 0)).toBe(2)
			expect(result.days.every((day) => String(day.variantId ?? "").length > 0)).toBe(true)
		})
	})

	it("v2 apply dryRun does not persist inventory changes", async () => {
		const token = "t_inv_bulk_v2_dryrun"
		const email = "inv-bulk-v2-dryrun@example.com"
		const providerId = `prov_inv_bulk_v2_dryrun_${crypto.randomUUID()}`
		const productId = `prod_inv_bulk_v2_dryrun_${crypto.randomUUID()}`
		const variantId = `var_inv_bulk_v2_dryrun_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })
		await upsertDailyRow({
			variantId,
			date: "2026-03-10",
			totalInventory: 4,
			stopSell: false,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_inv_bulk_v2_dryrun", email } }, async () => {
			const result = await applyBulkInventoryOperation({
				request: makeAuthedRequest({ path: "/internal-test", token }),
				input: {
					selection: { variantIds: [variantId] },
					dateRange: { from: "2026-03-10", to: "2026-03-11" },
					operation: { type: "SET_INVENTORY", value: 11 },
					context: { dryRun: true, source: "test_v2_dryrun" },
				},
			})

			expect(result.mode).toBe("apply")
			expect(result.context?.mode).toBe("v2")
			expect(result.context?.dryRun).toBe(true)
			expect(Number(result.summary.failedDays)).toBe(0)
		})

		const persisted = await getDailyRow(variantId, "2026-03-10")
		expect(Number((persisted as any)?.totalInventory)).toBe(4)
	})
})
