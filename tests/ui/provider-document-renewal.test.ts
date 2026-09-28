import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("renewal of scoped provider evidence", () => {
	it("keeps scope, expiry and historical reservations explicit for reviewers", () => {
		const admin = read("src/pages/admin/providers.astro")
		const console = read("src/lib/provider-admin-compliance.ts")
		const documents = read("src/lib/provider-documents.ts")

		expect(admin).toContain("Alcance:")
		expect(admin).toContain("Impacto a revisar")
		expect(admin).toContain("Las reservas existentes conservan su snapshot")
		expect(console).toContain("listExpiredProviderDocumentsForAdmin")
		expect(console).toContain("assessExpiredDocumentOperationalImpact")
		expect(documents).toContain("document_expired")
		expect(documents).toContain("replacementIsRenewable")
		expect(documents).toContain("existingReservationsTreatment: \"preserved_snapshot\"")
	})

	it("offers a deliberate renewal without dropping the current workflow context", () => {
		const optionals = read("src/components/provider/ProviderVerificationOptionals.astro")
		const page = read("src/pages/provider/settings/verification/documents.astro")

		expect(optionals).toContain("Renovar esta evidencia")
		expect(optionals).toContain("replacesDocumentId")
		expect(optionals).toContain("renewalHref")
		expect(optionals).toContain("no se copiará por suposición")
		expect(page).toContain("renewDocumentId")
		expect(page).toContain("scopeProductId")
	})
})
