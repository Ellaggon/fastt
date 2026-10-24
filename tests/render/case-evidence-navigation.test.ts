import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import CaseRelatedReviews from "@/components/admin/cases/CaseRelatedReviews.astro"
import CaseEvidencePanel from "@/components/admin/cases/CaseEvidencePanel.astro"
import CaseTable from "@/components/admin/cases/CaseTable.astro"
import type { CaseEvidenceReadModel } from "@/modules/casework/public"

const fiscal: CaseEvidenceReadModel = {
	domain: "fiscal",
	title: "Identidad y registro fiscal",
	description: "Datos declarados",
	sourceType: "ProviderTaxConfiguration",
	sourceRef: "provider-a",
	revision: "revision-a",
	observedAt: "2026-10-16T12:00:00Z",
	facts: [],
	signals: [],
	artifact: null,
	approvalBlockers: [],
	approvalWarnings: [],
	holderMatch: null,
	reveal: {
		kind: "tax_registration",
		label: "Revelar registro fiscal",
		fields: ["businessRegistrationNumber"],
	},
}
describe("review evidence navigation", () => {
	it("opens each actual review directly instead of sending the reviewer to a queue", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(CaseRelatedReviews, {
			props: {
				returnTo: "/admin/cases/identity-a",
				reviews: [
					{
						id: "fiscal-a",
						domain: "fiscal",
						status: "open",
						label: "Datos fiscales",
						documentName: null,
					},
					{
						id: "document-a",
						domain: "documents",
						status: "open",
						label: "Documento de identidad",
						documentName: "identidad.pdf",
					},
				],
			},
		})
		expect(html).toContain(
			"/admin/cases/fiscal-a?returnTo=%2Fadmin%2Fcases%2Fidentity-a#case-evidence"
		)
		expect(html).toContain(
			"/admin/cases/document-a?returnTo=%2Fadmin%2Fcases%2Fidentity-a#case-evidence"
		)
		expect(html).toContain("identidad.pdf")
		expect(html).not.toContain("/admin/queues/")
	})
	it("places secure fiscal access before decision criteria and distinguishes data from attachments", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(CaseEvidencePanel, {
			props: { evidence: fiscal, caseId: "fiscal-a", canReveal: true },
		})
		expect(html).toContain('id="case-evidence"')
		expect(html).toContain("datos fiscales declarados")
		expect(html).toContain('data-endpoint="/api/admin/v1/cases/fiscal-a/evidence/reveal"')
		expect(html.indexOf("data-evidence-reveal")).toBeLessThan(html.indexOf("Criterios de decisión"))
		expect(html).not.toContain("Consultar archivo original")
	})
	it("explains protected access without offering a form to a reader without reveal permission", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(CaseEvidencePanel, {
			props: { evidence: fiscal, caseId: "fiscal-a", canReveal: false },
		})
		expect(html).toContain("necesita permiso de acceso")
		expect(html).not.toContain("data-evidence-reveal")
	})
	it("gives queues an explicit action to inspect evidence", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(CaseTable, {
			request: new Request("https://fastt.test/admin/queues/fiscal"),
			props: {
				items: [
					{
						id: "fiscal-a",
						caseNumber: "CC-100",
						providerId: "provider-a",
						domain: "fiscal",
						status: "open",
						priority: "normal",
						riskTier: "standard",
						slaStatus: "none",
						openTasks: 1,
					},
				],
			},
		})
		expect(html).toContain("Revisar evidencia")
		expect(html).toContain("#case-evidence")
	})
})
