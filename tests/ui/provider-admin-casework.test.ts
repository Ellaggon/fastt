import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S5-5 admin case templates + a11y drawer + assignee shortcuts", () => {
	it("surfaces case templates inside the drawer", () => {
		const admin = read("src/pages/admin/providers.astro")
		expect(admin).toContain("data-case-templates")
		expect(admin).toContain("data-case-template")
		expect(admin).toContain("data-case-template-chips")
		expect(admin).toContain("data-template-body")
		expect(admin).toContain("Revisar y registrar resultado")
		expect(admin).toContain("templatesFor(")
		expect(admin).not.toContain("Plantillas de rechazo están en cada fila")
	})

	it("wires a11y dialog semantics and Escape/focus trap", () => {
		const admin = read("src/pages/admin/providers.astro")
		expect(admin).toContain('role="dialog"')
		expect(admin).toContain('aria-modal="true"')
		expect(admin).toContain('aria-labelledby="case-drawer-title"')
		expect(admin).toContain('id="case-drawer-title"')
		expect(admin).toContain("setupCaseDrawerA11y")
		expect(admin).toContain('event.key === "Escape"')
		expect(admin).toContain("document.body.style.overflow")
		expect(admin).toContain("getFocusable")
	})

	it("adds assignee shortcuts (Yo + recent chips)", () => {
		const assign = read("src/components/admin/AdminComplianceSlaAssign.astro")
		const admin = read("src/pages/admin/providers.astro")

		expect(assign).toContain("data-assignee-shortcuts")
		expect(assign).toContain("data-assignee-shortcut")
		expect(assign).toContain("data-assignee-me")
		expect(assign).toContain("currentAdminEmail")
		expect(assign).toContain("assigneeShortcuts")
		expect(assign).toContain('? "Yo" : email')
		expect(assign).toContain("data-assignee-me")

		expect(admin).toContain("assigneeShortcuts={assigneeShortcuts}")
		expect(admin).toContain("currentAdminEmail={adminEmail}")
		expect(admin).toContain("fastt.admin.assigneeShortcuts")
		expect(admin).toContain("[data-assignee-shortcut]")
	})
})

describe("S6-5 Admin reject dedupe when drawer open", () => {
	it("gates row reject forms on !focusedDetail; drawer keeps templates", () => {
		const admin = read("src/pages/admin/providers.astro")

		expect(admin).toContain('data-drawer-open={focusedDetail ? "true" : "false"}')
		expect(admin).toContain("data-row-reject")
		expect(admin).toContain("data-row-reject-deferred")
		expect(admin).toContain("revisión en el panel")
		expect(admin).toContain("data-case-templates")

		expect(admin).toContain('row.verificationStatus === "pending" && !focusedDetail && (')
		expect(admin).toMatch(
			/\{!focusedDetail && \(\s*<form[\s\S]*?data-tax-attention-form[\s\S]*?data-row-reject/
		)
		const documentTable = admin.slice(
			admin.indexOf("{documentRows.map"),
			admin.indexOf("{documentRows.length === 0")
		)
		expect(documentTable).not.toContain("data-verify-document")
		expect(documentTable).not.toContain("data-reject-document-form")
		expect(documentTable).toContain("Revisar documento")
		expect(admin).toContain("ProviderBankAccountReview")
		expect(admin).not.toContain("data-payment-attention-form")

		// Document decisions live only in the review panel.
		expect(admin).toContain("data-approve-provider={row.providerId}")
		expect(admin).toContain("data-verify-document={doc.id}")
		expect(admin).not.toContain("data-verify-payment")
	})
})

describe("document review feedback and navigation", () => {
	it("shows review failures next to the document and validates notes before submitting", () => {
		const admin = read("src/pages/admin/providers.astro")
		expect(admin).toContain("data-document-review-feedback")
		expect(admin).toContain("data-case-drawer-feedback")
		expect(admin).toContain("feedbackTarget")
		expect(admin).toContain("Escribe las notas que sustentan la revisión")
		expect(admin).toContain("data-astro-rerun")
		expect(admin).toContain("root.dataset.providerReviewBound")
	})
	it("does not infer verified fiscality or payout from an empty queue", () => {
		const source = read("src/lib/provider-admin-compliance.ts")
		expect(source).toContain('taxConfiguration?.status === "verified"')
		expect(source).toContain('paymentAccounts.some((account) => account.status === "verified")')
		expect(source).not.toContain('label: "Verificación global"')
	})
})
