import { describe, expect, it } from "vitest"
import {
	buildPayoutVerificationTimeline,
	type ProviderPaymentAccountRecord,
} from "@/lib/provider-payment-accounts"
const now = new Date("2026-10-17T00:00:00Z")
const base = {
	status: "pending" as const,
	verifiedAt: null,
	verificationMethod: "unverified" as const,
	microDeposit: { status: "none" as const, initiatedAt: null, expiresAt: null, attempts: 0 },
}
describe("bank verification presentation", () => {
	it("does not promise deposits before banking verification starts", () => {
		const result = buildPayoutVerificationTimeline(base, now)
		expect(result.phaseLabel).toBe("En revisión")
		expect(result.steps.map((step) => step.label)).toEqual([
			"Enviada",
			"Revisión del equipo",
			"Verificada",
		])
		expect(result.helperText).not.toMatch(/depósitos|1–2 días/)
	})
	it("offers confirmation only for a live, unexpired challenge", () => {
		const account = {
			...base,
			verificationMethod: "bank" as const,
			microDeposit: {
				status: "initiated" as const,
				initiatedAt: now.toISOString(),
				expiresAt: "2026-10-20",
				attempts: 1,
			},
		}
		expect(buildPayoutVerificationTimeline(account, now).showConfirmForm).toBe(true)
		expect(buildPayoutVerificationTimeline(account, now).attemptsRemaining).toBe(2)
		expect(
			buildPayoutVerificationTimeline({ ...account, verificationMethod: "unverified" }, now)
				.showConfirmForm
		).toBe(false)
		expect(buildPayoutVerificationTimeline(account, new Date("2026-10-21")).phaseLabel).toBe(
			"Verificación vencida"
		)
	})
	it("does not invent banking steps for manual approval", () => {
		const account = {
			...base,
			status: "verified",
			verificationMethod: "manual",
		} as ProviderPaymentAccountRecord
		const result = buildPayoutVerificationTimeline(account, now)
		expect(result.phaseLabel).toBe("Verificada")
		expect(result.steps.some((step) => step.id === "confirm")).toBe(false)
		expect(result.helperText).toContain("aún no están habilitadas")
	})
	it("preserves replacement and correction despite historical confirmation timestamps", () => {
		const account = {
			...base,
			verifiedAt: now,
			microDeposit: { ...base.microDeposit, status: "confirmed" as const },
		}
		expect(
			buildPayoutVerificationTimeline({ ...account, status: "superseded" }, now).phaseLabel
		).toBe("Reemplazada")
		expect(
			buildPayoutVerificationTimeline(
				{ ...account, status: "requires_attention", reviewReason: "Titular incorrecto" },
				now
			).helperText
		).toBe("Titular incorrecto")
	})
})
