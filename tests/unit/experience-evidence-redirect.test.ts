import { expect, it } from "vitest"
import {
	redirectAfterSubmit,
	redirectAfterFormError,
} from "@/pages/api/provider/settings/documents"

it.each(["activity", "safety"])(
	"returns evidence submissions to the same experience: %s",
	(area) => {
		const request = new Request(
			`https://fastt.test/api/provider/settings/documents?line=tour&tab=${area}&experience=a&returnTo=%2Fproduct%2Fa%2Fpreview`
		)
		for (const response of [
			redirectAfterSubmit(request, "submitted", "insurance"),
			redirectAfterFormError(request, "file_too_large", "insurance"),
		]) {
			const target = new URL(response.headers.get("location")!)
			expect(response.status).toBe(303)
			expect(target.pathname).toBe("/product/a")
			expect(target.searchParams.get("type")).toBe("insurance")
			expect(target.searchParams.get("returnTo")).toBe("/product/a/preview")
			expect(target.hash).toBe(
				area === "safety" ? "#experience-safety" : "#experience-requirements"
			)
		}
	}
)
it("keeps identity submissions in business verification", () => {
	const response = redirectAfterSubmit(
		new Request(
			"https://fastt.test/api/provider/settings/documents?line=tour&tab=identity&experience=a"
		),
		"submitted",
		"government_id"
	)
	const target = new URL(response.headers.get("location")!)
	expect(target.pathname).toBe("/provider/settings/verification")
	expect(target.hash).toBe("#kyc-slot-government_id")
})
