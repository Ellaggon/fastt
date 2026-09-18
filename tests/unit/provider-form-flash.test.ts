import { describe, expect, it } from "vitest"

import {
	createProviderFormFlash,
	providerFormErrorMessage,
	readProviderFormFlash,
} from "@/lib/provider-form-flash"

describe("provider form flash", () => {
	it("preserves allowed submitted values, including an intentional empty value", () => {
		const value = createProviderFormFlash({
			form: "identity",
			values: { displayName: "Andes Tours", legalName: "", ignored: "no" },
			errors: { legalName: "invalid", ignored: "no" },
		})
		expect(readProviderFormFlash(value, "identity")).toEqual({
			form: "identity",
			values: { displayName: "Andes Tours", legalName: "" },
			errors: { legalName: "invalid" },
		})
	})

	it("does not apply a flash from a different form", () => {
		const value = createProviderFormFlash({
			form: "profile",
			values: { supportEmail: "ops@fastt.test" },
			errors: {},
		})
		expect(readProviderFormFlash(value, "identity")).toBeNull()
		expect(providerFormErrorMessage("displayName")).toContain("nombre comercial")
	})
})
