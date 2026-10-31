import { afterEach, expect, it, vi } from "vitest"
import {
	allowLegacyLocalDocumentUrls,
	assertAllowedProviderDocumentUrl,
} from "@/lib/provider-document-storage"
import { documentSubmissionKey } from "@/lib/verification/document-upload-presentation"
afterEach(() => vi.unstubAllEnvs())
it.each(["development", "staging", "production"])(
	"does not allow local references in %s even under Vitest",
	(environment) => {
		vi.stubEnv("FASTT_DATA_ENV", environment)
		expect(allowLegacyLocalDocumentUrls()).toBe(false)
		expect(() => assertAllowedProviderDocumentUrl("local://fixture/file.pdf")).toThrow(
			"local_document_url_not_allowed"
		)
	}
)
it("allows placeholders only in the explicit test environment", () => {
	vi.stubEnv("FASTT_DATA_ENV", "test")
	expect(allowLegacyLocalDocumentUrls()).toBe(true)
})
it("retains a retry key only for the form that failed, not sibling document forms", () => {
	const url = new URL(
		"http://localhost/provider/settings/verification?documentSubmissionKey=synthetic-retry&documentSubmissionForm=kyc-government_id"
	)
	expect(documentSubmissionKey(url, "kyc-government_id")).toBe("synthetic-retry")
	expect(documentSubmissionKey(url, "kyc-business_registration")).not.toBe("synthetic-retry")
})
