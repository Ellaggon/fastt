/**
 * Account gates that exist today. Publish, booking, payments and integrations
 * read this map. Requirement resolution uses these existing account checks
 * without adding a new gate to hotel publication.
 */
export const providerGovernanceCapabilities = [
	"publish",
	"booking",
	"payments",
	"integrations",
] as const

export type ProviderGovernanceCapability = (typeof providerGovernanceCapabilities)[number]

export const providerGovernanceCapabilityMap = {
	identity: ["publish", "booking", "payments", "integrations"],
	operations: ["publish", "booking"],
	verification: ["publish", "booking", "payments", "integrations"],
	documents: ["payments", "integrations"],
	fiscality: ["publish", "booking", "payments"],
	payments: ["payments"],
	integrations: ["integrations"],
	team: ["publish", "booking", "payments", "integrations"],
} as const satisfies Record<string, readonly ProviderGovernanceCapability[]>

export type ProviderGovernanceCheckId = keyof typeof providerGovernanceCapabilityMap

export function governanceCheckIdsFor(
	capability: ProviderGovernanceCapability
): ProviderGovernanceCheckId[] {
	return (Object.keys(providerGovernanceCapabilityMap) as ProviderGovernanceCheckId[]).filter(
		(id) =>
			(providerGovernanceCapabilityMap[id] as readonly ProviderGovernanceCapability[]).includes(
				capability
			)
	)
}
