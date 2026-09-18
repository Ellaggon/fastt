import { describe, expect, it } from "vitest"

import { POST as providerIdentityPost } from "@/pages/api/providers"
import { PROVIDER_FORM_FLASH_COOKIE, readProviderFormFlash } from "@/lib/provider-form-flash"
import { withSupabaseAuthStub } from "../test-support/supabase-auth-stub"

describe("provider onboarding form feedback", () => {
	it("returns an invalid identity submission to its selected onboarding step with recoverable values", async () => {
		const token = `identity-feedback-${crypto.randomUUID()}`
		const form = new FormData()
		form.set("displayName", "A")
		form.set("legalName", "Andes SpA")
		form.set("onboardingNext", "/provider/onboarding/business?vertical=tour")
		const cookieWrites: Array<{ name: string; value: string; options: Record<string, unknown> }> =
			[]

		await withSupabaseAuthStub(
			{ [token]: { id: "feedback-user", email: "feedback@fastt.test" } },
			async () => {
				const response = await providerIdentityPost({
					request: new Request("http://localhost:4321/api/providers", {
						method: "POST",
						headers: {
							accept: "text/html",
							cookie: `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=fixture`,
						},
						body: form,
					}),
					cookies: {
						set(name: string, value: string, options: Record<string, unknown>) {
							cookieWrites.push({ name, value, options })
						},
					},
				} as any)

				expect(response.status).toBe(303)
				expect(response.headers.get("location")).toBe(
					"http://localhost:4321/provider/onboarding/business?vertical=tour&error=validation_error"
				)
				expect(cookieWrites).toHaveLength(1)
				expect(cookieWrites[0]?.name).toBe(PROVIDER_FORM_FLASH_COOKIE)
				expect(cookieWrites[0]?.options).toMatchObject({
					httpOnly: true,
					sameSite: "lax",
					path: "/provider",
					maxAge: 600,
				})
				expect(readProviderFormFlash(cookieWrites[0]?.value, "identity")).toMatchObject({
					values: { displayName: "A", legalName: "Andes SpA" },
					errors: { displayName: expect.any(String) },
				})
			}
		)
	})
})
