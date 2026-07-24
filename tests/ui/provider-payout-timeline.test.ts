import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	buildPayoutVerificationTimeline,
	PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS,
	type ProviderPaymentAccountRecord,
} from "@/lib/provider-payment-accounts"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function account(
	partial: Partial<ProviderPaymentAccountRecord> &
		Pick<ProviderPaymentAccountRecord, "status" | "microDeposit">
): Pick<ProviderPaymentAccountRecord, "status" | "microDeposit" | "verifiedAt"> {
	return {
		status: partial.status,
		microDeposit: partial.microDeposit,
		verifiedAt: partial.verifiedAt ?? null,
	}
}

describe("S1-2 payout verification timeline", () => {
	it("maps enviada → esperando depósitos → confirmar → lista", () => {
		const pendingNone = buildPayoutVerificationTimeline(
			account({
				status: "pending",
				microDeposit: { status: "none", initiatedAt: null, expiresAt: null, attempts: 0 },
			})
		)
		expect(pendingNone.steps.map((step) => step.label)).toEqual([
			"Enviada",
			"Esperando depósitos",
			"Confirmar montos",
			"Lista",
		])
		expect(pendingNone.currentStepId).toBe("awaiting_deposits")
		expect(pendingNone.phaseLabel).toBe("Esperando depósitos")
		expect(pendingNone.showConfirmForm).toBe(false)
		expect(pendingNone.steps[0].state).toBe("complete")
		expect(pendingNone.steps[1].state).toBe("current")

		const confirm = buildPayoutVerificationTimeline(
			account({
				status: "pending",
				microDeposit: {
					status: "initiated",
					initiatedAt: "2026-07-01T00:00:00.000Z",
					expiresAt: "2026-07-08T00:00:00.000Z",
					attempts: 1,
				},
			})
		)
		expect(confirm.currentStepId).toBe("confirm")
		expect(confirm.phaseLabel).toBe("Confirmar montos")
		expect(confirm.showConfirmForm).toBe(true)
		expect(confirm.attemptsRemaining).toBe(PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS - 1)
		expect(confirm.helperText).toContain("Te quedan")
		expect(confirm.steps[2].state).toBe("current")

		const ready = buildPayoutVerificationTimeline(
			account({
				status: "verified",
				verifiedAt: new Date("2026-07-10T00:00:00.000Z"),
				microDeposit: {
					status: "confirmed",
					initiatedAt: "2026-07-01T00:00:00.000Z",
					expiresAt: null,
					attempts: 1,
				},
			})
		)
		expect(ready.phaseLabel).toBe("Lista")
		expect(ready.showConfirmForm).toBe(false)
		expect(ready.steps.every((step) => step.state === "complete")).toBe(true)

		const blocked = buildPayoutVerificationTimeline(
			account({
				status: "requires_attention",
				microDeposit: {
					status: "failed",
					initiatedAt: "2026-07-01T00:00:00.000Z",
					expiresAt: null,
					attempts: PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS,
				},
			})
		)
		expect(blocked.phaseLabel).toBe("Requiere atención")
		expect(blocked.steps[2].state).toBe("blocked")
		expect(blocked.helperText).toContain("Se agotaron los intentos")
	})

	it("wires payments UI to timeline, confirm form and mismatch notices", () => {
		const page = read("src/pages/provider/settings/payments.astro")
		const card = read("src/components/provider/ProviderPaymentAccountsCard.astro")
		const timeline = read("src/components/provider/ProviderPayoutVerificationTimeline.astro")
		const api = read("src/pages/api/provider/settings/payment-accounts.ts")

		expect(card).toContain("buildPayoutVerificationTimeline")
		expect(card).toContain("ProviderPayoutVerificationTimeline")
		expect(card).toContain("enviada → esperando")
		expect(card).toContain("Confirmar montos")

		expect(timeline).toContain("Verificación de titularidad")
		expect(timeline).toContain("data-payout-timeline")
		expect(timeline).toContain("step.label")
		expect(timeline).toContain("Confirma antes del")

		const lib = read("src/lib/provider-payment-accounts.ts")
		expect(lib).toContain('label: "Enviada"')
		expect(lib).toContain('label: "Esperando depósitos"')
		expect(lib).toContain('label: "Confirmar montos"')
		expect(lib).toContain('label: "Lista"')
		expect(lib).toContain("buildPayoutVerificationTimeline")

		expect(page).toContain("micro_deposit_mismatch")
		expect(page).toContain("Montos incorrectos")
		expect(page).toContain("Cuenta lista")

		expect(api).toContain("redirectToPaymentsError")
		expect(api).toContain("micro_deposit_")
	})
})
