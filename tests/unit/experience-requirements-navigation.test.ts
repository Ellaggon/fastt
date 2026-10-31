import { expect, it } from "vitest"
import { experienceRequirementsHref } from "@/lib/verification/experience-requirements-navigation"

it("preserves evidence, renewal, errors and a validated return without old tabs", () => {
	const source = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=safety&type=insurance&renewDocumentId=d&result=error&error=validation_error&returnTo=%2Fproduct%2Fa%2Fpreview"
	)
	const target = new URL(experienceRequirementsHref("a", source), source)
	expect(target.pathname).toBe("/product/a")
	expect(target.hash).toBe("#experience-safety")
	expect(Object.fromEntries(target.searchParams)).toEqual({
		type: "insurance",
		renewDocumentId: "d",
		result: "error",
		error: "validation_error",
		returnTo: "/product/a/preview",
	})
})
it("rejects external returns and encodes product identifiers", () => {
	expect(
		experienceRequirementsHref("a/b", new URL("https://fastt.test/?returnTo=https://evil.test"))
	).toBe("/product/a%2Fb#experience-requirements")
})
it("keeps the upload retry identity when returning to the inline experience editor", () => {
	const source = new URL(
		"http://localhost/provider/settings/verification?tab=activity&documentSubmissionKey=retry&documentSubmissionForm=policy-a"
	)
	const target = new URL(experienceRequirementsHref("a", source), source)
	expect(target.searchParams.get("documentSubmissionKey")).toBe("retry")
	expect(target.searchParams.get("documentSubmissionForm")).toBe("policy-a")
})
