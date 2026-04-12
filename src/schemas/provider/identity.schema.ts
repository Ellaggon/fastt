import { z } from "zod"
import { providerIdentityConstraints } from "./provider.constants"

export const providerIdentitySchema = z.object({
	legalName: z
		.string()
		.trim()
		.min(providerIdentityConstraints.legalNameMin, "Legal name must be at least 2 characters"),
	displayName: z
		.string()
		.trim()
		.min(providerIdentityConstraints.displayNameMin, "Display name must be at least 2 characters"),
})

export type ProviderIdentity = z.infer<typeof providerIdentitySchema>
