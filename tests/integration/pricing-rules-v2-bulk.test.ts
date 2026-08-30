import { beforeAll, describe, expect, it } from "vitest"
import {
	db,
	eq,
	RatePlanOccupancyPolicy,
	sql,
} from "@/shared/infrastructure/db/compat"

import { pricingBulkJobService } from "@/container"
import {
	createCommercialPriceRule,
	listCommercialPriceRulesByRatePlan,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { runPricingBulkJobWorker } from "@/lib/pricing/pricing-bulk-job-worker"
import { deferPricingBulkJobFinalization } from "@/lib/pricing/pricing-bulk-job-queue"
import { POST as commercialRulesPost } from "@/pages/api/rates/commercial-rules"
import { POST as bulkApplyPost } from "@/pages/api/pricing/rules/v2/bulk-apply"
import { POST as bulkPreviewPost } from "@/pages/api/pricing/rules/v2/bulk-preview"
import { GET as listRulesV2Get } from "@/pages/api/pricing/rules/v2/list"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { withSupabaseAuthStub } from "../test-support/supabase-auth-stub"

function makeAuthedJsonRequest(params: {
	path: string
	token?: string
	body: Record<string, unknown>
	idempotencyKey?: string
}) {
	const headers = new Headers({ "Content-Type": "application/json" })
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	if (params.idempotencyKey) headers.set("idempotency-key", params.idempotencyKey)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(params.body),
	})
}

function makeAuthedGetRequest(params: { path: string; token?: string }) {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, { method: "GET", headers })
}

function makeAuthedFormRequest(params: { path: string; token: string; form: FormData }) {
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers: { cookie: `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r` },
		body: params.form,
	})
}

async function readJson(response: Response) {
	const text = await response.text()
	return text ? JSON.parse(text) : null
}

async function seedBulkFixture() {
	const suffix = crypto.randomUUID()
	const token = `t_pr_v2_bulk_${suffix}`
	const email = `pr-v2-bulk-${suffix}@example.com`
	const providerId = `prov_pr_v2_bulk_${suffix}`
	const geoPlaceId = `dest_pr_v2_bulk_${suffix}`
	const productId = `prod_pr_v2_bulk_${suffix}`
	const variantAId = `var_pr_v2_bulk_a_${suffix}`
	const variantBId = `var_pr_v2_bulk_b_${suffix}`
	const templateAId = `rpt_pr_v2_bulk_a_${suffix}`
	const templateBId = `rpt_pr_v2_bulk_b_${suffix}`
	const ratePlanAId = `rp_pr_v2_bulk_a_${suffix}`
	const ratePlanBId = `rp_pr_v2_bulk_b_${suffix}`

	await upsertGeoPlace({
		id: geoPlaceId,
		name: `Pricing V2 Bulk Dest ${suffix}`,
		type: "city",
		country: "CL",
		slug: `pricing-v2-bulk-${suffix}`,
	})
	await upsertProvider({
		id: providerId,
		displayName: "Pricing V2 Bulk Provider",
		ownerEmail: email,
	})
	await upsertProduct({
		id: productId,
		name: "Pricing V2 Bulk Product",
		productType: "Hotel",
		geoPlaceId,
		providerId,
	})
	await upsertVariant({
		id: variantAId,
		productId,
		kind: "hotel_room",
		name: "Habitación A",
		baseRateCurrency: "USD",
		baseRatePrice: 100,
	})
	await upsertVariant({
		id: variantBId,
		productId,
		kind: "hotel_room",
		name: "Habitación B",
		baseRateCurrency: "USD",
		baseRatePrice: 120,
	})
	await upsertRatePlanTemplate({
		id: templateAId,
		name: "Default A",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlanTemplate({
		id: templateBId,
		name: "Default B",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: ratePlanAId,
		templateId: templateAId,
		variantId: variantAId,
		isActive: true,
		isDefault: true,
	})
	await upsertRatePlan({
		id: ratePlanBId,
		templateId: templateBId,
		variantId: variantBId,
		isActive: true,
		isDefault: true,
	})

	return { token, email, userId: `user_${email}`, providerId, ratePlanAId, ratePlanBId }
}

async function submitAndCompleteBulkApply(params: {
	fixture: Awaited<ReturnType<typeof seedBulkFixture>>
	body: Record<string, unknown>
}) {
	const response = await bulkApplyPost({
		request: makeAuthedJsonRequest({
			path: "/api/pricing/rules/v2/bulk-apply",
			token: params.fixture.token,
			idempotencyKey: `pricing-bulk-test:${crypto.randomUUID()}`,
			body: params.body,
		}),
	} as any)
	expect(response.status).toBe(202)
	const accepted = await readJson(response)
	const jobId = String(accepted?.job?.id ?? "")
	expect(jobId).not.toBe("")

	return drainPricingBulkJob({
		providerId: params.fixture.providerId,
		jobId,
	})
}

async function drainPricingBulkJob(params: { providerId: string; jobId: string }) {
	for (let tick = 0; tick < 5; tick += 1) {
		await runPricingBulkJobWorker({
			jobBatchSize: 4,
			itemBatchSize: 20,
			itemConcurrency: 2,
			timeBudgetMs: 30_000,
		})
		const current = await pricingBulkJobService.get(params)
		if (!current) throw new Error("pricing_bulk_job_not_found_after_worker")
		if (
			["succeeded", "partial", "failed", "requires_attention", "cancelled"].includes(
				current.job.status
			)
		) {
			expect(current.job.status).toBe("succeeded")
			return current
		}
	}
	throw new Error(`pricing_bulk_job_did_not_finish:${params.jobId}`)
}

describe("integration/pricing rules v2 bulk orchestration", () => {
	beforeAll(async () => {
		await db.execute(sql`
			DELETE FROM "PricingBulkOperationJob"
			WHERE "providerId" LIKE 'prov_pr_v2_bulk_%'
		`)
	})
	it("bulk endpoints validan payload mínimo", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const response = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [],
							operation: { type: "percentage", value: 10 },
						},
					}),
				} as any)
				expect(response.status).toBe(400)
				const payload = await readJson(response)
				expect(payload?.error).toBe("validation_error")
			}
		)
	})

	it("preview determinista para mismo input", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const body = {
					ratePlanIds: [fixture.ratePlanAId, fixture.ratePlanBId],
					operation: { type: "percentage", value: 10, conditions: { previewDays: 5 } },
					concurrency: 2,
				}
				const response1 = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body,
					}),
				} as any)
				expect(response1.status).toBe(200)
				const payload1 = await readJson(response1)

				const response2 = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body,
					}),
				} as any)
				expect(response2.status).toBe(200)
				const payload2 = await readJson(response2)

				expect(payload1).toEqual(payload2)
				expect(payload1?.results?.[0]?.preview?.dateRange?.from).toBeTypeOf("string")
				expect(payload1?.results?.[0]?.preview?.dateRange?.to).toBeTypeOf("string")
				expect(payload1?.results?.[0]?.preview?.priceSummary?.before?.avg).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.priceSummary?.after?.avg).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.breakdown?.daysWithoutCoverage).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.businessMetrics?.averageNightlyChange).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.days?.[0]?.dayOfWeekLabel).toBeTypeOf("string")
			}
		)
	})

	it("calendar-style fixed override wins over existing fixed price rules", async () => {
		const fixture = await seedBulkFixture()
		await createCommercialPriceRule({
			providerId: fixture.providerId,
			ruleId: `rule_existing_${crypto.randomUUID()}`,
			ratePlanId: fixture.ratePlanAId,
			name: "ctx:manual",
			type: "fixed_override",
			value: 15,
			priority: 10,
			dateRangeJson: { from: "2026-05-19", to: "2026-05-26" },
			dayOfWeekJson: null,
		})

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const response = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: {
								type: "fixed_override",
								value: 20,
								conditions: {
									priority: 1000,
									dateFrom: "2026-05-19",
									dateTo: "2026-05-26",
									previewFrom: "2026-05-19",
									previewDays: 8,
									effectiveFrom: "2026-05-19",
									effectiveTo: "2026-05-27",
									contextKey: "manual",
								},
							},
						},
					}),
				} as any)
				expect(response.status).toBe(200)
				const payload = await readJson(response)
				const first = payload?.results?.[0]
				expect(first?.preview?.priceSummary?.before?.avg).toBe(15)
				expect(first?.preview?.priceSummary?.after?.avg).toBe(20)
				expect(first?.diff?.changedDays).toBe(8)
			}
		)
	})

	it("aplica un precio fijo aunque la tarifa todavía no tenga precio base", async () => {
		const fixture = await seedBulkFixture()
		await db
			.delete(RatePlanOccupancyPolicy)
			.where(eq(RatePlanOccupancyPolicy.ratePlanId, fixture.ratePlanAId))

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const completed = await submitAndCompleteBulkApply({
					fixture,
					body: {
						ratePlanIds: [fixture.ratePlanAId],
						operation: {
							type: "fixed_override",
							value: 10,
							conditions: {
								priority: 1000,
								dateFrom: "2026-06-20",
								dateTo: "2026-06-22",
								previewFrom: "2026-06-20",
								previewDays: 3,
								effectiveFrom: "2026-06-20",
								effectiveTo: "2026-06-23",
								contextKey: "manual",
							},
						},
					},
				})
				expect(completed.job.succeededItems).toBe(1)
				expect(completed.job.failedItems).toBe(0)
				expect(completed.items[0]?.ruleId).toBeTruthy()
				expect(completed.items[0]?.materializationResult).toMatchObject({
					generatedDatesCount: expect.any(Number),
				})
				expect(completed.job.materializationCompletedAt).toBeInstanceOf(Date)
				expect(completed.job.cacheInvalidationCompletedAt).toBeInstanceOf(Date)
				expect(completed.job.ariEnqueueCompletedAt).toBeInstanceOf(Date)
				expect(completed.job.finalizationResult).toMatchObject({
					status: "succeeded",
					succeededItems: 1,
					materializationCompleted: true,
					cacheInvalidationCompleted: true,
					ariEnqueueCompleted: true,
				})
			}
		)
	})

	it("maneja fallos parciales sin romper lote", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const response = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId, `missing_${crypto.randomUUID()}`],
							operation: { type: "percentage", value: 8 },
							concurrency: 2,
						},
					}),
				} as any)
				expect(response.status).toBe(200)
				const payload = await readJson(response)
				expect(payload?.summary?.total).toBe(2)
				expect(payload?.summary?.success).toBe(1)
				expect(payload?.summary?.failed).toBe(1)
				expect(Array.isArray(payload?.failures)).toBe(true)
				expect(payload.failures[0]?.ratePlanId).toContain("missing_")
			}
		)
	})

	it("apply mantiene aislamiento entre ratePlans", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const completed = await submitAndCompleteBulkApply({
					fixture,
					body: {
						ratePlanIds: [fixture.ratePlanAId],
						operation: { type: "percentage", value: 15, conditions: { effectiveDays: 7 } },
					},
				})
				expect(completed.job.succeededItems).toBe(1)

				const listA = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const listABody = await readJson(listA)

				const listB = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanBId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanBId)}`
					),
				} as any)
				const listBBody = await readJson(listB)

				expect(Array.isArray(listABody?.rules)).toBe(true)
				expect(listABody.rules.length).toBeGreaterThan(0)
				expect(Array.isArray(listBBody?.rules)).toBe(true)
				expect(listBBody.rules.length).toBe(0)
			}
		)
	})

	it("consistencia: apply devuelve resultados trazables por ratePlan", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const completed = await submitAndCompleteBulkApply({
					fixture,
					body: {
						ratePlanIds: [fixture.ratePlanAId, fixture.ratePlanBId],
						operation: { type: "fixed_adjustment", value: 7, conditions: { effectiveDays: 5 } },
						concurrency: 2,
					},
				})
				expect(completed.job.totalItems).toBe(2)
				expect(completed.job.succeededItems).toBe(2)
				expect(completed.job.failedItems).toBe(0)
				expect(completed.items.every((item) => typeof item.ratePlanId === "string")).toBe(true)
				expect(
					completed.items.every((item) => typeof item.ruleId === "string" && item.ruleId.length > 0)
				).toBe(true)
			}
		)
	})

	it("recupera un lease vencido y completa el mismo trabajo sin duplicar reglas", async () => {
		const fixture = await seedBulkFixture()
		const { job } = await pricingBulkJobService.enqueue({
			providerId: fixture.providerId,
			requestedByUserId: fixture.userId,
			input: {
				ratePlanIds: [fixture.ratePlanAId],
				idempotencyKey: `pricing-bulk-recovery:${crypto.randomUUID()}`,
				operation: { type: "percentage", value: 9, conditions: { effectiveDays: 3 } },
			},
		})
		const expiredAt = new Date(Date.now() - 120_000).toISOString()
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET "status" = 'running', "pendingItems" = 0, "runningItems" = 1,
				"lockedAt" = ${expiredAt}, "lockedBy" = 'dead-worker', "startedAt" = ${expiredAt}
			WHERE "id" = ${job.id}
		`)
		await db.execute(sql`
			UPDATE "PricingBulkOperationItem"
			SET "status" = 'running', "attempts" = 1, "startedAt" = ${expiredAt}
			WHERE "jobId" = ${job.id}
		`)

		const worker = await runPricingBulkJobWorker({
			now: new Date(),
			leaseMs: 30_000,
			jobBatchSize: 1,
			itemBatchSize: 20,
			itemConcurrency: 2,
			timeBudgetMs: 20_000,
		})
		const completed = await drainPricingBulkJob({
			providerId: fixture.providerId,
			jobId: job.id,
		})

		expect(worker.recoveredJobs).toBe(1)
		expect(completed?.job.status).toBe("succeeded")
		expect(completed?.items[0]?.attempts).toBeGreaterThanOrEqual(2)
		expect(completed?.items[0]?.ruleId).toBeTruthy()
	})

	it("detiene una finalización agotada en requires_attention y permite reanudarla", async () => {
		const fixture = await seedBulkFixture()
		const { job } = await pricingBulkJobService.enqueue({
			providerId: fixture.providerId,
			requestedByUserId: fixture.userId,
			input: {
				ratePlanIds: [fixture.ratePlanAId],
				idempotencyKey: `pricing-bulk-attention:${crypto.randomUUID()}`,
				operation: { type: "percentage", value: 4, conditions: { effectiveDays: 2 } },
			},
		})
		const leaseToken = `test-lease:${crypto.randomUUID()}`
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET "status" = 'finalizing', "lockedAt" = CURRENT_TIMESTAMP, "lockedBy" = ${leaseToken},
				"finalizationAttempts" = 4, "finalizationMaxAttempts" = 5
			WHERE "id" = ${job.id}
		`)
		const claimed = {
			id: job.id,
			providerId: fixture.providerId,
			requestedByUserId: fixture.userId,
			commandJson: job.command,
			operationType: "create_pricing_rule" as const,
			attempts: 0,
			maxAttempts: 3,
			finalizationAttempts: 4,
			finalizationMaxAttempts: 5,
			materializationCompletedAt: null,
			cacheInvalidationCompletedAt: null,
			ariEnqueueCompletedAt: null,
			status: "finalizing" as const,
			createdAt: job.createdAt,
		}
		expect(
			await deferPricingBulkJobFinalization({
				job: claimed,
				leaseToken,
				now: new Date(),
				errorCode: "forced_finalization_failure",
				errorDetail: "Fallo controlado de certificación.",
			})
		).toBe(true)
		const attention = await pricingBulkJobService.get({
			providerId: fixture.providerId,
			jobId: job.id,
		})
		expect(attention?.job.status).toBe("requires_attention")

		const resumed = await pricingBulkJobService.retryFailed({
			providerId: fixture.providerId,
			requestedByUserId: fixture.userId,
			jobId: job.id,
		})
		expect(resumed.status).toBe("finalizing")
		expect(resumed.finalizationAttempts).toBe(0)
	})

	it("bulk preview no persiste reglas nuevas", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const beforeList = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const beforePayload = await readJson(beforeList)
				const beforeCount = Array.isArray(beforePayload?.rules) ? beforePayload.rules.length : 0

				const previewResponse = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: { type: "percentage", value: 12, conditions: { effectiveDays: 5 } },
							dryRun: true,
						},
					}),
				} as any)
				expect(previewResponse.status).toBe(200)
				const previewPayload = await readJson(previewResponse)
				expect(previewPayload?.summary?.success).toBe(1)

				const afterList = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const afterPayload = await readJson(afterList)
				const afterCount = Array.isArray(afterPayload?.rules) ? afterPayload.rules.length : 0
				expect(afterCount).toBe(beforeCount)
			}
		)
	})

	it("bulk apply soporta reglas segmentadas por occupancyKey sin romper reglas globales", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const globalCompleted = await submitAndCompleteBulkApply({
					fixture,
					body: {
						ratePlanIds: [fixture.ratePlanAId],
						operation: { type: "fixed_adjustment", value: 5, conditions: { effectiveDays: 5 } },
					},
				})
				expect(globalCompleted.job.succeededItems).toBe(1)

				const scopedCompleted = await submitAndCompleteBulkApply({
					fixture,
					body: {
						ratePlanIds: [fixture.ratePlanAId],
						operation: {
							type: "percentage_markup",
							value: 10,
							conditions: {
								effectiveDays: 5,
								occupancyKey: buildOccupancyKey({ adults: 3, children: 0, infants: 0 }),
							},
						},
					},
				})
				expect(scopedCompleted.job.succeededItems).toBe(1)

				const listResponse = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				expect(listResponse.status).toBe(200)
				const listPayload = await readJson(listResponse)
				const rules = Array.isArray(listPayload?.rules) ? listPayload.rules : []
				expect(rules.length).toBeGreaterThanOrEqual(2)
				expect(rules.some((rule: any) => rule.occupancyKey === null)).toBe(true)
				expect(
					rules.some(
						(rule: any) =>
							rule.occupancyKey === buildOccupancyKey({ adults: 3, children: 0, infants: 0 })
					)
				).toBe(true)
			}
		)
	})

	it("crea variantes de precio pausadas y conserva la regla de origen", async () => {
		const fixture = await seedBulkFixture()
		const sourceRuleId = `source_${crypto.randomUUID()}`
		const created = await createCommercialPriceRule({
			providerId: fixture.providerId,
			ratePlanId: fixture.ratePlanAId,
			type: "fixed_override",
			value: 125,
			priority: 21,
			dateRangeJson: { from: "2026-07-01", to: "2026-07-05" },
			isActive: false,
			sourceRuleId,
		})

		const result = await db.execute(sql`
			SELECT
				rs."status" AS "ruleSetStatus",
				r."isActive" AS "ruleActive",
				r."configJson" AS "configJson",
				a."isActive" AS "applicationActive"
			FROM "CommercialRule" r
			INNER JOIN "CommercialRuleSet" rs ON rs."id" = r."ruleSetId"
			INNER JOIN "CommercialRuleApplication" a ON a."ruleId" = r."id"
			WHERE r."id" = ${created.ruleId}
		`)
		const row = (result as any).rows?.[0] ?? (result as any)[0]
		const config =
			row?.configJson && typeof row.configJson === "object"
				? row.configJson
				: JSON.parse(String(row?.configJson ?? "{}"))

		expect(row?.ruleSetStatus).toBe("paused")
		expect(Number(row?.ruleActive)).toBe(0)
		expect(Number(row?.applicationActive)).toBe(0)
		expect(config.sourceRuleId).toBe(sourceRuleId)
	})

	it("rechaza una variante idéntica sin crear otra regla", async () => {
		const fixture = await seedBulkFixture()
		const original = await createCommercialPriceRule({
			providerId: fixture.providerId,
			ratePlanId: fixture.ratePlanAId,
			type: "fixed_override",
			value: 125,
			priority: 20,
			dateRangeJson: { from: "2026-07-10", to: "2026-07-12" },
		})
		const before = await listCommercialPriceRulesByRatePlan(fixture.ratePlanAId)
		const form = new FormData()
		form.set("action", "create-variant")
		form.set("ruleId", original.ruleId)
		form.set("category", "price")
		form.set("ratePlanId", fixture.ratePlanAId)
		form.set("startDate", "2026-07-10")
		form.set("endDate", "2026-07-12")
		form.set("value", "125")
		form.set("priority", "21")

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: fixture.userId, email: fixture.email } },
			async () => {
				const response = await commercialRulesPost({
					request: makeAuthedFormRequest({
						path: "/api/rates/commercial-rules",
						token: fixture.token,
						form,
					}),
				} as any)
				expect(response.status).toBe(303)
				expect(response.headers.get("location")).toContain("Cambia+la+vigencia+o+el+valor")
			}
		)

		const after = await listCommercialPriceRulesByRatePlan(fixture.ratePlanAId)
		expect(after).toHaveLength(before.length)
	})
})
