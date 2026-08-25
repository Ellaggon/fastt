import { describe, it, expect } from "vitest"
import { resolveEffectiveTaxFees } from "@/modules/taxes-fees/public"
import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "@/modules/taxes-fees/public"

function def(partial: Partial<TaxFeeDefinition>): TaxFeeDefinition {
	return {
		id: partial.id ?? crypto.randomUUID(),
		providerId: partial.providerId ?? null,
		code: partial.code ?? "TAX",
		name: partial.name ?? "Tax",
		kind: partial.kind ?? "tax",
		calculationType: partial.calculationType ?? "percentage",
		value: partial.value ?? 10,
		currency: partial.currency ?? null,
		inclusionType: partial.inclusionType ?? "excluded",
		appliesPer: partial.appliesPer ?? "stay",
		priority: partial.priority ?? 0,
		jurisdictionJson: partial.jurisdictionJson ?? null,
		effectiveFrom: partial.effectiveFrom ?? null,
		effectiveTo: partial.effectiveTo ?? null,
		status: partial.status ?? "active",
		createdAt: partial.createdAt ?? new Date(),
		updatedAt: partial.updatedAt ?? new Date(),
	}
}

function assign(params: {
	id?: string
	definitionId: string
	scope: TaxFeeScope
	scopeId: string | null
	channel?: string | null
}): TaxFeeAssignment {
	return {
		id: params.id ?? crypto.randomUUID(),
		taxFeeDefinitionId: params.definitionId,
		scope: params.scope,
		scopeId: params.scopeId,
		channel: params.channel ?? null,
		status: "active",
		createdAt: new Date(),
	}
}

describe("taxes-fees/resolveEffectiveTaxFees", () => {
	it("collects assignments across scopes and filters by effective dates", async () => {
		const activeDef = def({ id: "d1", priority: 1 })
		const expiredDef = def({
			id: "d2",
			effectiveTo: new Date(Date.now() - 1000),
		})
		const higherPriority = def({ id: "d3", priority: 0 })

		const repo = {
			listActiveAssignments: async () => [
				assign({ definitionId: "d1", scope: "product", scopeId: "p1" }),
				assign({ definitionId: "d2", scope: "product", scopeId: "p1" }),
				assign({ definitionId: "d3", scope: "global", scopeId: null }),
			],
			listDefinitionsByIds: async () => [activeDef, expiredDef, higherPriority],
			getProviderIdByProductId: async () => "prov1",
		}

		const res = await resolveEffectiveTaxFees(
			{ repo },
			{
				productId: "p1",
			}
		)

		expect(res.definitions.map((d) => d.definition.id)).toEqual(["d3", "d1"])
	})

	it("includes channel-specific and channel-null assignments", async () => {
		const channelDef = def({ id: "d4" })
		const nullChannelDef = def({ id: "d5" })
		const repo = {
			listActiveAssignments: async ({ channels }: { channels: Array<string | null> }) =>
				channels.includes("web")
					? [
							assign({ definitionId: "d4", scope: "global", scopeId: null, channel: "web" }),
							assign({ definitionId: "d5", scope: "global", scopeId: null, channel: null }),
						]
					: [],
			listDefinitionsByIds: async () => [channelDef, nullChannelDef],
			getProviderIdByProductId: async () => null,
		}

		const res = await resolveEffectiveTaxFees({ repo: repo as any }, { channel: "web" })
		expect(res.definitions.map((d) => d.definition.id)).toEqual(["d4", "d5"])
	})

	it("passes both the scope chain and requested channels to the repository", async () => {
		const definition = def({ id: "scoped-web" })
		let received: { scopeChain?: unknown; channels?: unknown } | null = null
		const repo = {
			listActiveAssignments: async (params: {
				scopeChain: unknown
				channels: unknown
			}) => {
				received = params
				return [assign({ definitionId: "scoped-web", scope: "provider", scopeId: "prov1", channel: "web" })]
			},
			listDefinitionsByIds: async () => [definition],
			getProviderIdByProductId: async () => "prov1",
		}

		await resolveEffectiveTaxFees({ repo: repo as any }, { productId: "product1", channel: "web" })
		expect(received).toEqual({
			scopeChain: [
				{ scope: "global", scopeId: null },
				{ scope: "provider", scopeId: "prov1" },
				{ scope: "product", scopeId: "product1" },
			],
			channels: ["web", null],
		})
	})

	it("keeps all matching scopes additive while the fiscality migration is in progress", async () => {
		const provider = def({ id: "provider", priority: 4 })
		const product = def({ id: "product", priority: 3 })
		const unit = def({ id: "unit", priority: 2 })
		const rate = def({ id: "rate", priority: 1 })
		const repo = {
			listActiveAssignments: async () => [
				assign({ definitionId: "provider", scope: "provider", scopeId: "prov1" }),
				assign({ definitionId: "product", scope: "product", scopeId: "product1" }),
				assign({ definitionId: "unit", scope: "variant", scopeId: "unit1" }),
				assign({ definitionId: "rate", scope: "rate_plan", scopeId: "rate1" }),
			],
			listDefinitionsByIds: async () => [provider, product, unit, rate],
			getProviderIdByProductId: async () => "prov1",
		}

		const res = await resolveEffectiveTaxFees(
			{ repo },
			{ productId: "product1", variantId: "unit1", ratePlanId: "rate1" }
		)

		expect(res.definitions.map((item) => item.definition.id)).toEqual([
			"rate",
			"unit",
			"product",
			"provider",
		])
	})

	it("skips invalid definitions without throwing", async () => {
		const valid = def({ id: "ok" })
		const invalid = def({ id: "bad", value: 0 })

		const repo = {
			listActiveAssignments: async () => [
				assign({ definitionId: "ok", scope: "global", scopeId: null }),
				assign({ definitionId: "bad", scope: "global", scopeId: null }),
			],
			listDefinitionsByIds: async () => [valid, invalid],
			getProviderIdByProductId: async () => null,
		}

		const res = await resolveEffectiveTaxFees({ repo: repo as any }, {})
		expect(res.definitions.map((d) => d.definition.id)).toEqual(["ok"])
	})
})
