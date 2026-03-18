import type { APIRoute } from "astro"
import { db, eq, sql } from "astro:db"
import { Policy, PolicyRule, CancellationTier } from "astro:db"

type CreateVersionBody = {
	previousPolicyId: string
	description?: string
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export const POST: APIRoute = async ({ request }) => {
	const { previousPolicyId, description, cancellationTiers } =
		(await request.json()) as CreateVersionBody

	if (!previousPolicyId) {
		return new Response("Missing previousPolicyId", { status: 400 })
	}

	return await db.transaction(async (tx) => {
		/* 1️⃣ Obtener política anterior */
		const existing = await tx.select().from(Policy).where(eq(Policy.id, previousPolicyId)).get()

		if (!existing) {
			return new Response("Policy not found", { status: 404 })
		}

		/* 2️⃣ Calcular próxima versión segura */
		const maxVersionRow = await tx
			.select({
				max: sql<number>`MAX(${Policy.version})`,
			})
			.from(Policy)
			.where(eq(Policy.groupId, existing.groupId))
			.get()

		const nextVersion = (maxVersionRow?.max ?? 0) + 1

		const newPolicyId = crypto.randomUUID()

		/* 3️⃣ Insertar nueva versión (CLONANDO description si no viene) */
		await tx.insert(Policy).values({
			id: newPolicyId,
			groupId: existing.groupId,
			description: description ?? existing.description,
			version: nextVersion,
			status: "draft",
			effectiveFrom: null,
			effectiveTo: null,
		})

		/* 4️⃣ Copiar PolicyRules */
		const previousRules = await tx
			.select()
			.from(PolicyRule)
			.where(eq(PolicyRule.policyId, previousPolicyId))

		if (previousRules.length) {
			await tx.insert(PolicyRule).values(
				previousRules.map((rule) => ({
					id: crypto.randomUUID(),
					policyId: newPolicyId,
					ruleKey: rule.ruleKey,
					ruleValue: rule.ruleValue,
				}))
			)
		}

		/* 5️⃣ Copiar CancellationTiers */
		/* 5️⃣ Insertar CancellationTiers nuevos */
		if (cancellationTiers?.length) {
			await tx.insert(CancellationTier).values(
				cancellationTiers.map((tier) => ({
					id: crypto.randomUUID(),
					policyId: newPolicyId,
					daysBeforeArrival: tier.daysBeforeArrival,
					penaltyType: tier.penaltyType,
					penaltyAmount: tier.penaltyAmount,
				}))
			)
		}

		return new Response(
			JSON.stringify({
				success: true,
				id: newPolicyId,
				groupId: existing.groupId,
				version: nextVersion,
			}),
			{
				headers: { "Content-Type": "application/json" },
			}
		)
	})
}
