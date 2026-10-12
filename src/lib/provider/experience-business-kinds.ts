import {
	and,
	db,
	eq,
	ProviderCommercialLine,
	ProviderAuditLog,
} from "@/shared/infrastructure/db/compat"
import { parseExperienceBusinessKinds } from "@/shared/domain/experience-classification"
export async function readExperienceBusinessKinds(providerId: string) {
	const [row] = await db
		.select({ businessKinds: ProviderCommercialLine.businessKinds })
		.from(ProviderCommercialLine)
		.where(
			and(
				eq(ProviderCommercialLine.providerId, providerId),
				eq(ProviderCommercialLine.line, "tour")
			)
		)
	return row?.businessKinds ?? null
}
export async function saveExperienceBusinessKinds(input: {
	providerId: string
	actorId: string
	kinds: unknown
}) {
	const kinds = parseExperienceBusinessKinds(input.kinds)
	await db.transaction(async (tx) => {
		const [line] = await tx
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, input.providerId),
					eq(ProviderCommercialLine.line, "tour")
				)
			)
			.for("update")
		if (!line) throw new Error("No encontramos la línea de experiencias de tu negocio.")
		if ([...line.businessKinds].sort().join() === [...kinds].sort().join()) return
		await tx
			.update(ProviderCommercialLine)
			.set({ businessKinds: kinds, businessKindsUpdatedAt: new Date() })
			.where(eq(ProviderCommercialLine.id, line.id))
		await tx.insert(ProviderAuditLog).values({
			id: crypto.randomUUID(),
			providerId: input.providerId,
			actorUserId: input.actorId,
			action: "provider.experience_business.declared",
			entityType: "ProviderCommercialLine",
			entityId: line.id,
			beforeJson: { businessKinds: line.businessKinds },
			afterJson: { businessKinds: kinds },
			riskLevel: "low",
		})
	})
}
