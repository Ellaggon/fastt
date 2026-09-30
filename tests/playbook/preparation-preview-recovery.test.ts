import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], loadState: vi.fn() }))
vi.mock("@/lib/playbook/evaluate-complete-to-publish-progress", () => ({
	loadCompleteToPublishState: mocks.loadState,
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select: () => ({
				from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => mocks.rows }) }) }),
			}),
		},
	}
})

import { listActivePreparationSessions } from "@/lib/onboarding/preparationSession"
import { summarizeProductPreparation } from "@/lib/playbook/summarize-product-preparation"
import { resolveProductPreparationCoach } from "@/lib/playbook/product-preparation-coach"

const baseSession = {
	productId: "tour-1",
	productName: "Tour de prueba",
	vertical: "tour",
	playbookId: "complete-to-publish",
	stepId: "preview",
	variantId: "slot-2",
	ratePlanId: "rate-2",
	lastPath: null,
}

describe("preparation preview recovery through dashboard summary", () => {
	beforeEach(() => {
		mocks.rows = []
		mocks.loadState.mockResolvedValue({
			readyToPublish: true,
			blockers: [],
			completedChecks: 1,
			totalChecks: 1,
			readinessPercent: 100,
			checks: [
				{
					key: "preview",
					sectionKey: "preview",
					complete: true,
					label: "Vista previa",
					guestImpact: "Revisar",
					cta: "Revisar",
					detail: "Lista",
					statusLabel: "Lista",
					href: "/product/tour-1/preview?variantId=slot-1&ratePlanId=rate-1",
				},
			],
		})
	})
	it.each([null, "", "/product/tour-1/preview?playbook=complete-to-publish&step=preview"])(
		"retains the persisted offer when lastPath is %s",
		async (lastPath) => {
			mocks.rows = [{ ...baseSession, lastPath }]
			const sessions = await listActivePreparationSessions("provider-1", "user-1")
			const summary = await summarizeProductPreparation({
				productId: "tour-1",
				providerId: "provider-1",
				lastPath: sessions[0].href,
			})
			expect(summary?.readyToPublish).toBe(true)
			const coach = resolveProductPreparationCoach(summary!)
			const url = new URL(coach.href, "https://fastt.test")
			expect(url.searchParams.get("variantId")).toBe("slot-2")
			expect(url.searchParams.get("ratePlanId")).toBe("rate-2")
			expect(summary?.continuePreparationHref).toBe(coach.href)
		}
	)
	it("retains the persisted selection when the last completed step was calendar", async () => {
		mocks.rows = [{ ...baseSession, stepId: "calendar", lastPath: null }]
		const sessions = await listActivePreparationSessions("provider-1", "user-1")
		const summary = await summarizeProductPreparation({
			productId: "tour-1",
			providerId: "provider-1",
			lastPath: sessions[0].href,
		})
		const url = new URL(resolveProductPreparationCoach(summary!).href, "https://fastt.test")
		expect(url.pathname).toBe("/product/tour-1/preview")
		expect(url.searchParams.get("variantId")).toBe("slot-2")
		expect(url.searchParams.get("ratePlanId")).toBe("rate-2")
	})

	it("uses the diagnostic selection for the ready dashboard CTA without a session", async () => {
		const summary = await summarizeProductPreparation({
			productId: "tour-1",
			providerId: "provider-1",
		})
		const url = new URL(resolveProductPreparationCoach(summary!).href, "https://fastt.test")
		expect(url.searchParams.get("variantId")).toBe("slot-1")
		expect(url.searchParams.get("ratePlanId")).toBe("rate-1")
	})
	it("preserves the saved pair rather than replacing it with the primary offer", async () => {
		const lastPath =
			"/product/tour-1/preview?playbook=complete-to-publish&variantId=slot-3&ratePlanId=rate-3"
		mocks.rows = [{ ...baseSession, lastPath }]
		const sessions = await listActivePreparationSessions("provider-1", "user-1")
		expect(sessions[0].href).toBe(lastPath)
	})
})
