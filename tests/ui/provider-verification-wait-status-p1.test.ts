import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { shouldSuppressVerificationStatusWarning } from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P1 verification wait/status", () => {
	it("suppresses yellow warning for upload/access and when docs already submitted", () => {
		expect(
			shouldSuppressVerificationStatusWarning({
				ctaKind: "upload",
				hasActionableDocumentGaps: true,
			})
		).toBe(true)
		expect(
			shouldSuppressVerificationStatusWarning({
				ctaKind: "access",
				hasActionableDocumentGaps: true,
			})
		).toBe(true)
		expect(
			shouldSuppressVerificationStatusWarning({
				ctaKind: "navigate",
				anchorsKyc: true,
				hasActionableDocumentGaps: true,
			})
		).toBe(true)
		expect(
			shouldSuppressVerificationStatusWarning({
				ctaKind: "navigate",
				anchorsKyc: false,
				hasActionableDocumentGaps: false,
			})
		).toBe(true)
		expect(
			shouldSuppressVerificationStatusWarning({
				ctaKind: "navigate",
				anchorsKyc: false,
				hasActionableDocumentGaps: true,
			})
		).toBe(false)
	})

	it("wires compact wait, collapsed matrix, and suppress helper on verification page", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(page).toContain("shouldSuppressVerificationStatusWarning")
		expect(page).toContain("hasActionableDocumentGaps")
		expect(page).toContain("suppressConsequence={suppressStatusConsequence}")

		expect(view).toContain("data-verification-suppress-warning")
		expect(view).toContain("data-verification-compact-wait")
		expect(view).toContain("data-verification-wait-summary")
		expect(view).toContain("data-verification-wait-compact")
		expect(view).toContain('data-verification-matrix="removed"')
		expect(view).toContain("useCompactWait")
		expect(view).toContain("showWarningConsequence")
		expect(view).toContain("Qué se bloquea")
	})
})
