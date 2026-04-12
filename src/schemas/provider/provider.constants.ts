import { z } from "zod"

export const currencyRegex = /^[A-Z]{3}$/
export const phoneRegex = /^[+\d\s().-]{6,20}$/

export const providerIdentityConstraints = {
	legalNameMin: 2,
	displayNameMin: 2,
} as const

export const providerProfileConstraints = {
	timezoneMin: 1,
	defaultCurrencyLength: 3,
	phoneMin: 6,
} as const

export const emailSchema = z.string().trim().email("Invalid email format")

export const optionalPhoneSchema = z
	.string()
	.trim()
	.regex(phoneRegex, "Phone must contain 6-20 valid phone characters")
	.optional()

export const timezoneSchema = z
	.string()
	.trim()
	.min(providerProfileConstraints.timezoneMin, "Timezone is required")
	.refine((value) => {
		try {
			// Simple runtime check without adding timezone libraries.
			new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
			return true
		} catch {
			return false
		}
	}, "Invalid timezone")
