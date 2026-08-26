import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildProviderReviewWaitState } from "@/lib/provider-review-wait-state"
import { readVerificationSurface } from "./read-verification-surface"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S3-2 payout SLA mirror + post-save CTAs", () => {
	it("builds payment wait-state with SLA mirror parity", () => {
		const without = buildProviderReviewWaitState("payment")
		expect(without.title).toBe("En revisión")
		expect(without.body).toMatch(/depósitos|extracto/i)
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
		const page = readVerificationSurface("src/pages/provider/settings/verification/payments.astro")
		const card = read("src/components/provider/ProviderPaymentAccountsCard.astro")

		expect(page).toContain("listOpenComplianceAssignments")
		expect(page).toContain("paymentAssignments")
		expect(page).toContain('domain === "payments"')
		expect(page).toContain("paymentAssignments={paymentAssignments}")
		expect(page).toContain("data-post-save-cta")
		expect(page).toContain("ProviderTrustMapRail")
		expect(page).toContain("activeId={initialPanel}")

		expect(card).toContain("ProviderReviewWaitNotice")
		expect(card).toContain('domain="payment"')
		expect(card).toContain("paymentAssignments")
		expect(card).toContain("assignment={paymentAssignments[account.id]")
	})

	it("exposes post-save CTAs toward verification (data surfaces) and next domains", () => {
		const profile = read("src/pages/provider/settings/profile.astro")
		const verification = readVerificationSurface("src/pages/provider/settings/verification.astro")
		const taxIdentity = readVerificationSurface("src/pages/provider/settings/verification/fiscal.astro")

		expect(profile).toContain("data-post-save-cta")
		expect(profile).toContain("TRUST_GLOSSARY.returnToVerification")
		expect(verification).toContain("data-post-save-cta")
		expect(verification).toContain("Continuar a registro fiscal")
		expect(verification).toContain("Continuar a pagos")
		expect(taxIdentity).toContain("data-post-save-cta")
		expect(taxIdentity).not.toContain("TRUST_GLOSSARY.returnToVerification")
		expect(taxIdentity).not.toContain('slot="actions"')
		expect(taxIdentity).toContain("Continuar a pagos")
	})
})
