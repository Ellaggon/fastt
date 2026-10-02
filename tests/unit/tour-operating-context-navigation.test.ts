import { expect, it } from "vitest"
import { tourOperatingContextRedirect } from "@/pages/api/provider/settings/tour-operating-context"

it.each(["context_saved", "invalid_context", "invalid_territory", "forbidden"])(
	"preserves mixed-provider context on %s",
	(result) => {
		const source = new URL(
			"https://fastt.test/api/provider/settings/tour-operating-context?line=tour&tab=activity&lodgingTab=fiscal&experience=stale&tourTab=safety"
		)
		source.searchParams.set("returnTo", "/product/a/preview?variantId=v&ratePlanId=r")
		const response = tourOperatingContextRedirect(new Request(source), "a", result)
		const target = new URL(response.headers.get("location")!)
		expect(response.status).toBe(303)
		expect(target.searchParams.get("lodgingTab")).toBe("fiscal")
		expect(target.searchParams.get("experience")).toBe("a")
		expect(target.searchParams.get("tourTab")).toBe("activity")
		expect(target.searchParams.get("returnTo")).toBe("/product/a/preview?variantId=v&ratePlanId=r")
		expect(target.searchParams.get(result === "context_saved" ? "result" : "error")).toBe(result)
	}
)
it("does not transport arbitrary redirect or query parameters", () => {
	const response = tourOperatingContextRedirect(
		new Request(
			"https://fastt.test/api/provider/settings/tour-operating-context?line=tour&returnTo=//evil.test&arbitrary=1"
		),
		"a",
		"context_saved"
	)
	const target = new URL(response.headers.get("location")!)
	expect(target.searchParams.has("returnTo")).toBe(false)
	expect(target.searchParams.has("arbitrary")).toBe(false)
})
