import { describe, expect, it, vi } from "vitest"

export type RatePlanContextIds = {
	productId: string
	variantId: string
	ratePlanId: string
}

export type RatePlanFirstInput = {
	productId?: string
	variantId?: string
	ratePlanId?: string
}

type ExpectedResponse = {
	status: number
	body?: unknown | ((body: any) => void)
}

type ScenarioName =
	| "rateplan_only"
	| "both_consistent"
	| "rateplan_mismatch"
	| "rateplan_not_found"
	| "missing_context"

export type RatePlanFirstScenarioAssertArgs = {
	scenario: ScenarioName
	seeded: RatePlanContextIds
	input: RatePlanFirstInput
	response: Response
	body: any
}

export type RatePlanFirstSuiteConfig = {
	suiteName: string
	seedContext: () => Promise<RatePlanContextIds>
	execute: (input: RatePlanFirstInput) => Promise<Response>
	extractResolvedContext?: (body: any) => {
		productId?: string | null
		variantId?: string | null
		ratePlanId?: string | null
	}
	expectedMissingContext: ExpectedResponse
	expectedRatePlanNotFound: ExpectedResponse
	mismatchLogEvent?: string
	notFoundLogEvent?: string
	assertScenario?: (args: RatePlanFirstScenarioAssertArgs) => void | Promise<void>
}

async function readJson(response: Response) {
	const text = await response.text()
	return text ? JSON.parse(text) : null
}

function assertExpectedBody(assertion: ExpectedResponse["body"], body: any) {
	if (typeof assertion === "function") {
		assertion(body)
		return
	}
	if (assertion !== undefined) {
		expect(body).toEqual(assertion)
	}
}

function assertResolvedFromRatePlan(
	extractResolvedContext: NonNullable<RatePlanFirstSuiteConfig["extractResolvedContext"]>,
	body: any,
	seeded: RatePlanContextIds
) {
	const resolved = extractResolvedContext(body)
	expect(resolved.productId).toBe(seeded.productId)
	expect(resolved.variantId).toBe(seeded.variantId)
	expect(resolved.ratePlanId).toBe(seeded.ratePlanId)
}

export function defineRatePlanFirstTestSuite(config: RatePlanFirstSuiteConfig) {
	const mismatchEvent = config.mismatchLogEvent ?? "rateplan_owner_context_mismatch_ignored"
	const notFoundEvent = config.notFoundLogEvent ?? "rateplan_owner_context_not_found"
	const shouldAssertResolvedContext = typeof config.extractResolvedContext === "function"

	describe(config.suiteName, () => {
		it("solo ratePlanId: usa contexto derivado", async () => {
			const seeded = await config.seedContext()
			const input: RatePlanFirstInput = { ratePlanId: seeded.ratePlanId }
			const response = await config.execute(input)
			const body = await readJson(response)

			expect(response.status).toBe(200)
			if (shouldAssertResolvedContext) {
				assertResolvedFromRatePlan(config.extractResolvedContext!, body, seeded)
			}
			await config.assertScenario?.({
				scenario: "rateplan_only",
				seeded,
				input,
				response,
				body,
			})
		})

		it("ambos consistentes: responde correctamente", async () => {
			const seeded = await config.seedContext()
			const input: RatePlanFirstInput = {
				productId: seeded.productId,
				variantId: seeded.variantId,
				ratePlanId: seeded.ratePlanId,
			}
			const response = await config.execute(input)
			const body = await readJson(response)

			expect(response.status).toBe(200)
			if (shouldAssertResolvedContext) {
				assertResolvedFromRatePlan(config.extractResolvedContext!, body, seeded)
			}
			await config.assertScenario?.({
				scenario: "both_consistent",
				seeded,
				input,
				response,
				body,
			})
		})

		it("mismatch: ratePlanId domina y no rompe ejecución", async () => {
			const seeded = await config.seedContext()
			const input: RatePlanFirstInput = {
				productId: `wrong_prod_${crypto.randomUUID()}`,
				variantId: `wrong_var_${crypto.randomUUID()}`,
				ratePlanId: seeded.ratePlanId,
			}
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
			const response = await config.execute(input)
			const body = await readJson(response)

			expect(response.status).toBe(200)
			if (shouldAssertResolvedContext) {
				assertResolvedFromRatePlan(config.extractResolvedContext!, body, seeded)
			}
			expect(warnSpy.mock.calls.some((call) => call[0]?.event === mismatchEvent)).toBe(true)
			warnSpy.mockRestore()
			await config.assertScenario?.({
				scenario: "rateplan_mismatch",
				seeded,
				input,
				response,
				body,
			})
		})

		it("ratePlanId inexistente: falla correctamente", async () => {
			const seeded = await config.seedContext()
			const input: RatePlanFirstInput = { ratePlanId: `missing_rp_${crypto.randomUUID()}` }
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
			const response = await config.execute(input)
			const body = await readJson(response)

			expect(response.status).toBe(config.expectedRatePlanNotFound.status)
			assertExpectedBody(config.expectedRatePlanNotFound.body, body)
			expect(warnSpy.mock.calls.some((call) => call[0]?.event === notFoundEvent)).toBe(true)
			warnSpy.mockRestore()
			await config.assertScenario?.({
				scenario: "rateplan_not_found",
				seeded,
				input,
				response,
				body,
			})
		})

		it("falta total de contexto: validación controlada", async () => {
			const seeded = await config.seedContext()
			const input: RatePlanFirstInput = {}
			const response = await config.execute(input)
			const body = await readJson(response)

			expect(response.status).toBe(config.expectedMissingContext.status)
			assertExpectedBody(config.expectedMissingContext.body, body)
			await config.assertScenario?.({
				scenario: "missing_context",
				seeded,
				input,
				response,
				body,
			})
		})
	})
}
