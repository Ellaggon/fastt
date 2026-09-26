import { describe, expect, it } from "vitest"

import {
	formIncludesIdentityFields,
	validateProviderSettingsForm,
} from "@/lib/provider/save-provider-settings-profile"

function settingsForm(entries: Record<string, string>) {
	const form = new FormData()
	for (const [key, value] of Object.entries(entries)) form.set(key, value)
	return form
}

describe("provider settings unified save", () => {
	it("rejects a partial fill so identity and operations are saved together or not at all", () => {
		const form = settingsForm({
			displayName: "Paseos del sur",
			legalName: "Paseos Ltda",
			holderType: "entidad",
			holderCountry: "BO",
			timezone: "America/La_Paz",
			defaultCurrency: "BOB",
			supportEmail: "not-an-email",
			supportPhone: "123456",
		})
		expect(formIncludesIdentityFields(form)).toBe(true)
		expect(validateProviderSettingsForm(form, { includeIdentity: true })).toHaveProperty(
			"supportEmail"
		)
	})

	it("accepts identity and operations in one payload", () => {
		const form = settingsForm({
			displayName: "Paseos del sur",
			legalName: "Paseos Ltda",
			holderType: "entidad",
			holderCountry: "BO",
			taxResidenceCountry: "BO",
			payoutCountry: "BO",
			timezone: "America/La_Paz",
			defaultCurrency: "BOB",
			supportEmail: "ellaggon@tuta.io",
			supportPhone: "123456",
		})
		expect(validateProviderSettingsForm(form, { includeIdentity: true })).toEqual({})
	})
})
