import { expect, it } from "vitest"
import {
	redirectAfterFiscalSubmit,
	redirectAfterFiscalError,
} from "@/pages/api/provider/settings/tax-configuration"
import {
	copyVerificationNavigationQuery,
	resolveVerificationNavigation,
	verificationNavigationHref,
	verificationSectionUrl,
} from "@/lib/verification/navigation"

it.each(["tour", "lodging"])("fiscal redirects override stale tabs for %s", (line) => {
	const request = new Request(
		`https://fastt.test/api/provider/settings/tax-configuration?line=${line}&tab=identity&tourTab=safety&lodgingTab=business&experience=a&returnTo=%2Fproduct%2Fa%2Fpreview`
	)
	for (const response of [
		redirectAfterFiscalSubmit(request, "tax_profile_saved"),
		redirectAfterFiscalError(request, "validation_error"),
	]) {
		const url = new URL(response.headers.get("location")!)
		expect(response.status).toBe(303)
		expect(url.pathname).toBe("/provider/settings/verification")
		expect(url.searchParams.get("tab")).toBe("fiscal")
		expect(url.searchParams.get(`${line}Tab`)).toBe("fiscal")
		expect(url.searchParams.get(line === "tour" ? "lodgingTab" : "tourTab")).toBe(
			line === "tour" ? "business" : "safety"
		)
		expect(url.searchParams.get("experience")).toBe("a")
		expect(url.searchParams.get("returnTo")).toBe("/product/a/preview")
	}
})

it("remembers the active safety tab rather than a stale remembered tab on line switches", () => {
	const url = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=safety&tourTab=identity&lodgingTab=fiscal&experience=a&returnTo=%2Fproduct%2Fa%2Fpreview"
	)
	const input = {
		lines: ["tour", "lodging"] as const,
		experienceIds: ["a", "b"],
		fasttCollects: false,
	}
	const navigation = resolveVerificationNavigation({ url, ...input })
	const lodging = new URL(verificationNavigationHref({ url, navigation, line: "lodging" }), url)
	const back = new URL(
		verificationNavigationHref({
			url: lodging,
			navigation: resolveVerificationNavigation({ url: lodging, ...input }),
			line: "tour",
		}),
		url
	)
	for (const key of ["tab", "tourTab"]) expect(back.searchParams.get(key)).toBe("safety")
	expect(back.searchParams.get("experience")).toBe("a")
	expect(back.searchParams.get("returnTo")).toBe("/product/a/preview")
})

it("does not copy unrelated query or external return when declaring the form tab", () => {
	const result = copyVerificationNavigationQuery(
		new URL("https://fastt.test/api/provider/settings/tax-configuration"),
		new URL(
			"https://fastt.test/?line=tour&tab=identity&returnTo=https%3A%2F%2Fevil.test&unexpected=1"
		),
		"fiscal"
	)
	expect(result.searchParams.get("tab")).toBe("fiscal")
	expect(result.searchParams.has("returnTo")).toBe(false)
	expect(result.searchParams.has("unexpected")).toBe(false)
})

it.each(["tour", "lodging"])(
	"legacy fiscal entry preserves navigation and messages for %s",
	(line) => {
		const source = new URL(
			`https://fastt.test/provider/settings/verification/fiscal?line=${line}&tab=identity&experience=a&tourTab=safety&lodgingTab=business&result=tax_profile_saved&returnTo=%2Fproduct%2Fa%2Fpreview`
		)
		const canonical = verificationSectionUrl(source, "fiscal")
		expect(canonical.pathname).toBe("/provider/settings/verification")
		expect(Object.fromEntries(canonical.searchParams)).toMatchObject({
			line,
			tab: "fiscal",
			experience: "a",
			result: "tax_profile_saved",
			returnTo: "/product/a/preview",
			[`${line}Tab`]: "fiscal",
		})
		expect(verificationSectionUrl(canonical, "fiscal").href).toBe(canonical.href)
	}
)
it("legacy entry without line still opens Fiscal and keeps errors", () => {
	const url = verificationSectionUrl(
		new URL(
			"https://fastt.test/provider/settings/verification/fiscal?error=validation_error&returnTo=https://evil.test"
		),
		"fiscal"
	)
	expect(url.searchParams.get("tab")).toBe("fiscal")
	expect(url.searchParams.get("error")).toBe("validation_error")
	expect(url.searchParams.has("returnTo")).toBe(false)
})

it("fiscal form without line returns to Fiscal instead of the default identity section", () => {
	const response = redirectAfterFiscalSubmit(
		new Request("https://fastt.test/api/provider/settings/tax-configuration"),
		"tax_profile_saved"
	)
	const target = new URL(response.headers.get("location")!)
	expect(target.pathname).toBe("/provider/settings/verification")
	expect(target.searchParams.get("tab")).toBe("fiscal")
	expect(target.searchParams.get("result")).toBe("tax_profile_saved")
})
it("success and error redirects do not carry contradictory old messages", () => {
	const request = new Request(
		"https://fastt.test/api/provider/settings/tax-configuration?line=tour&result=old&error=old"
	)
	const success = new URL(
		redirectAfterFiscalSubmit(request, "tax_profile_saved").headers.get("location")!
	)
	const error = new URL(
		redirectAfterFiscalError(request, "validation_error").headers.get("location")!
	)
	expect(success.searchParams.has("error")).toBe(false)
	expect(error.searchParams.has("result")).toBe(false)
	expect(error.searchParams.get("error")).toBe("validation_error")
})
