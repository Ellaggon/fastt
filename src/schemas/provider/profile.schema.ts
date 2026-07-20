import { z } from "zod"
import {
	currencyRegex,
	emailSchema,
	optionalPhoneSchema,
	providerProfileConstraints,
	timezoneSchema,
} from "./provider.constants"

export const providerProfileSchema = z.object({
	timezone: timezoneSchema,
	defaultCurrency: z
		.string()
		.trim()
		.length(
			providerProfileConstraints.defaultCurrencyLength,
			"Currency must be a 3-letter ISO code"
		)
		.regex(currencyRegex, "Currency must be a valid ISO 4217 code (e.g. USD)"),
	supportEmail: emailSchema.optional(),
	supportPhone: optionalPhoneSchema,
})

export type ProviderProfile = z.infer<typeof providerProfileSchema>
