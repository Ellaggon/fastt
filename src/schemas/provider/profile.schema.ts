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
	taxResidenceCountry: z.string().trim().length(2).optional(),
	businessRegistrationNumber: z.string().trim().min(3).max(80).optional(),
	fiscalStatus: z.enum(["not_configured", "pending", "verified", "requires_attention"]).optional(),
	paymentReadinessStatus: z
		.enum(["not_configured", "pending", "verified", "requires_attention"])
		.optional(),
	integrationReadinessStatus: z
		.enum(["not_configured", "pending", "ready", "requires_attention"])
		.optional(),
})

export type ProviderProfile = z.infer<typeof providerProfileSchema>
