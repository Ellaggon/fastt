import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildPayoutVerificationTimeline } from "@/lib/provider-payment-accounts"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-4 guided payouts: one account + micro-deposit education", () => {
	it("educates hosts while awaiting and confirming micro-deposits", () => {
		const awaiting = buildPayoutVerificationTimeline({
			status: "pending",
			verifiedAt: null,
			microDeposit: { status: "none", initiatedAt: null, expiresAt: null, attempts: 0 },
		})
		expect(awaiting.helperText).toMatch(/extracto|depósitos/i)
		expect(awaiting.helperText).toMatch(/1–2 días|días hábiles/i)

		const confirm = buildPayoutVerificationTimeline({
			status: "pending",
			verifiedAt: null,
			microDeposit: {
				status: "initiated",
				initiatedAt: "2026-07-01T00:00:00.000Z",
				expiresAt: "2026-07-08T00:00:00.000Z",
				attempts: 0,
			},
		})
		expect(confirm.helperText).toMatch(/centavos/i)
		expect(confirm.helperText).toMatch(/extracto|banco/i)
	})

	it("wires one-account-first UX and API guard", () => {
		const page = read("src/pages/provider/settings/verification/payments.astro")
		const card = read("src/components/provider/ProviderPaymentAccountsCard.astro")
		const api = read("src/pages/api/provider/settings/payment-accounts.ts")
		const lib = read("src/lib/provider-payment-accounts.ts")

		expect(card).toContain("data-payments-guided")
		expect(card).toContain("data-payments-one-account")
		expect(card).toContain("Una cuenta primero")
		expect(card).toContain("canShowCreateForm")
		expect(card).toContain("hasInFlightAccount")
		expect(card).toContain('data-micro-deposit-education="awaiting"')
		expect(card).toContain('data-micro-deposit-education="confirm"')
		expect(card).toContain('data-long-copy-collapsed="true"')
		expect(card).toContain("<details")
		expect(card).toContain("Cómo confirmar los micro-depósitos")
		expect(card).toContain("Cómo leer el extracto")
		expect(card).toContain("data-payments-create-form")
		expect(card).toContain("Primera cuenta bancaria")

		expect(page).toContain("pending_account_in_progress")
		expect(page).toContain("Ya hay una cuenta en curso")
		expect(page).toContain("depósitos pequeños")
		expect(page).not.toContain(">Fiscalidad</Button>")
		expect(page).not.toContain(">Resumen</Button>")

		expect(lib).toContain("pending_account_in_progress")
		expect(lib).toContain('eq(ProviderPaymentAccount.status, "requires_attention")')
		expect(api).toContain("pending_account_in_progress")
	})
})
