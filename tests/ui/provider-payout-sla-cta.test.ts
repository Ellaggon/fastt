import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildProviderReviewWaitState } from "@/lib/provider-review-wait-state"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S3-2 payout SLA mirror + post-save CTAs", () => {
	it("builds payment wait-state with SLA mirror parity", () => {
		const without = buildProviderReviewWaitState("payment")
		expect(without.title).toBe("En revisión")
		expect(without.body).toContain("payout")
		expect(without.sla.hasPublishedSla).toBe(false)
		expect(without.footnote).toContain("Sin plazo fijo publicado")

		const withSla = buildProviderReviewWaitState("payment", {
			assignment: {
				slaDueAt: "2026-08-01T12:00:00.000Z",
				slaState: "ok",
			},
		})
		expect(withSla.sla.hasPublishedSla).toBe(true)
		expect(withSla.footnote).toContain("Objetivo de respuesta")
		expect(withSla.footnote).not.toMatch(/@/)
	})

	it("wires payments page/card to payment assignments and wait notice", () => {
		const page = read("src/pages/provider/settings/payments.astro")
		const card = read("src/components/provider/ProviderPaymentAccountsCard.astro")

		expect(page).toContain("listOpenComplianceAssignments")
		expect(page).toContain("paymentAssignments")
		expect(page).toContain('domain === "payments"')
		expect(page).toContain("paymentAssignments={paymentAssignments}")
		expect(page).toContain("data-post-save-cta")
		expect(page).toContain("Continuar a integraciones")

		expect(card).toContain("ProviderReviewWaitNotice")
		expect(card).toContain('domain="payment"')
		expect(card).toContain("paymentAssignments")
		expect(card).toContain("assignment={paymentAssignments[account.id]")
	})

	it("exposes post-save CTAs toward the next settings domain", () => {
		const profile = read("src/pages/provider/settings/profile.astro")
		const verification = read("src/pages/provider/settings/verification.astro")
		const taxIdentity = read("src/pages/provider/settings/tax-fees/identity.astro")

		expect(profile).toContain("data-post-save-cta")
		expect(profile).toContain("Continuar a verificación")
		expect(verification).toContain("data-post-save-cta")
		expect(verification).toContain("Continuar a registro fiscal")
		expect(verification).toContain("Continuar a pagos")
		expect(taxIdentity).toContain("data-post-save-cta")
		expect(taxIdentity).toContain("Continuar a pagos")
	})
})
