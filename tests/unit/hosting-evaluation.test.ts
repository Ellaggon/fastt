import { afterEach, expect, test, vi } from "vitest"
import { hostingEvaluationResponse } from "@/lib/platform/hosting-evaluation"
afterEach(() => vi.unstubAllEnvs())
test.each(["POST", "PUT", "PATCH", "DELETE"])(
	"blocks %s mutations before handlers run",
	(method) => {
		vi.stubEnv("FASTT_HOSTING_EVALUATION_READ_ONLY", "true")
		expect(
			hostingEvaluationResponse(new Request("https://test.invalid/api/inventory/hold", { method }))
				?.status
		).toBe(403)
	}
)
test.each(["/api/auth/signin", "/api/auth/logout"])(
	"permits existing session action %s",
	(path) => {
		vi.stubEnv("FASTT_HOSTING_EVALUATION_READ_ONLY", "true")
		expect(
			hostingEvaluationResponse(new Request(`https://test.invalid${path}`, { method: "POST" }))
		).toBeNull()
	}
)
test("permits navigation but blocks GET cron execution", () => {
	vi.stubEnv("FASTT_HOSTING_EVALUATION_READ_ONLY", "true")
	expect(hostingEvaluationResponse(new Request("https://test.invalid/dashboard"))).toBeNull()
	expect(
		hostingEvaluationResponse(new Request("https://test.invalid/api/cron/document-processing"))
			?.status
	).toBe(403)
})
test("does not alter the existing app when evaluation mode is absent", () => {
	vi.stubEnv("FASTT_HOSTING_EVALUATION_READ_ONLY", undefined)
	expect(
		hostingEvaluationResponse(
			new Request("https://test.invalid/api/inventory/hold", { method: "POST" })
		)
	).toBeNull()
})
