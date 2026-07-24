import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	buildProviderReviewWaitState,
	PROVIDER_REVIEW_WAIT_LABEL,
} from "@/lib/provider-review-wait-state"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function visibleCopy(source: string) {
	return source.replace(/^---[\s\S]*?---\s*/m, "")
}

const falseEtaPhrases = [
	"suele tomar",
	"días hábiles",
	"dias habiles",
	"24-48",
	"24/48",
	"1-2 días",
	"1–2 días",
	"2-3 días",
	"en 48 horas",
	"en 24 horas",
	"plazo estimado de",
]

describe("S1-3 / S2-4 review wait-state + SLA mirror", () => {
	it("builds honest En revisión copy without invented deadlines", () => {
		const fiscal = buildProviderReviewWaitState("fiscal")
		const document = buildProviderReviewWaitState("document")

		expect(fiscal.label).toBe(PROVIDER_REVIEW_WAIT_LABEL)
		expect(fiscal.title).toBe("En revisión")
		expect(fiscal.footnote).toContain("Sin plazo fijo publicado")
		expect(document.body).toContain("documento")

		for (const wait of [fiscal, document]) {
			const blob = `${wait.title} ${wait.body} ${wait.footnote}`.toLowerCase()
			for (const phrase of falseEtaPhrases) {
				expect(blob, `found false ETA: ${phrase}`).not.toContain(phrase.toLowerCase())
			}
		}
	})

	it("wires fiscal and docs UI to shared wait notice and En revisión labels", () => {
		const taxCard = read("src/components/provider/ProviderTaxProfileCard.astro")
		const kycCard = read("src/components/provider/ProviderKycSlotsCard.astro")
		const verification = read("src/pages/provider/settings/verification.astro")
		const taxPage = read("src/pages/provider/settings/tax-fees/identity.astro")
		const notice = read("src/components/provider/ProviderReviewWaitNotice.astro")
		const taxLib = read("src/lib/provider-tax-configuration.ts")
		const docsLib = read("src/lib/provider-documents.ts")

		expect(taxCard).toContain("ProviderReviewWaitNotice")
		expect(taxCard).toContain('domain="fiscal"')
		expect(taxCard).toContain("PROVIDER_REVIEW_WAIT_LABEL")
		expect(taxCard).toContain("assignment={reviewAssignment}")
		expect(kycCard).toContain('domain="document"')
		expect(verification).toContain("ProviderReviewWaitNotice")
		expect(verification).toContain("Quedó en revisión")
		expect(taxPage).toContain("Quedó en revisión")
		expect(taxPage).toContain("reviewAssignment={fiscalAssignment}")

		expect(notice).toContain("buildProviderReviewWaitState")
		expect(notice).toContain("wait.footnote")
		expect(notice).toContain("data-sla-mirror")

		expect(taxLib).toContain('{ value: "pending", label: "En revisión" }')
		expect(docsLib).toContain('pending: { label: "En revisión"')

		const visible = [taxCard, kycCard, verification, taxPage, notice].map(visibleCopy).join("\n")
		for (const phrase of falseEtaPhrases) {
			expect(visible, `UI contains false ETA: ${phrase}`).not.toContain(phrase)
		}
	})

	it("mirrors real SLA when ops assignment exists and never invents one", () => {
		const without = buildProviderReviewWaitState("fiscal")
		expect(without.sla.hasPublishedSla).toBe(false)
		expect(without.footnote).toContain("Sin plazo fijo publicado")

		const withSla = buildProviderReviewWaitState("document", {
			assignment: {
				slaDueAt: "2026-08-01T12:00:00.000Z",
				slaState: "ok",
			},
		})
		expect(withSla.sla.hasPublishedSla).toBe(true)
		expect(withSla.footnote).toContain("Objetivo de respuesta")
		expect(withSla.footnote.toLowerCase()).not.toContain("assignee")
		expect(withSla.footnote).not.toMatch(/@/)
	})
})
