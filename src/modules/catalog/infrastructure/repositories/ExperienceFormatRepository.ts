import { and, db, eq, Product, ProviderAuditLog, Tour } from "@/shared/infrastructure/db/compat"
import {
	ExperienceFormatError,
	isExperienceFormat,
	type ExperienceFormat,
} from "@/shared/domain/experience-format"

/** Classification and its audit commit together; the product lock serializes concurrent declarations. */
export class ExperienceFormatRepository {
	async declare(input: {
		productId: string
		providerId: string
		actorUserId: string
		experienceFormat: ExperienceFormat
	}) {
		if (!isExperienceFormat(input.experienceFormat))
			throw new ExperienceFormatError("invalid_format")
		return db.transaction(async (tx) => {
			const [product] = await tx
				.select({ id: Product.id })
				.from(Product)
				.where(
					and(
						eq(Product.id, input.productId),
						eq(Product.providerId, input.providerId),
						eq(Product.productType, "tour")
					)
				)
				.for("update")
			if (!product) throw new ExperienceFormatError("product_not_owned")
			return persistExperienceFormatDeclaration(tx, input)
		})
	}
}

/** Caller owns the product lock; used by the presentation's existing atomic save. */
export async function persistExperienceFormatDeclaration(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	input: {
		productId: string
		providerId: string
		actorUserId: string
		experienceFormat: ExperienceFormat
	}
) {
	const [before] = await tx
		.select({
			experienceFormat: Tour.experienceFormat,
			formatContractVersion: Tour.formatContractVersion,
		})
		.from(Tour)
		.where(eq(Tour.productId, input.productId))
	if (before?.experienceFormat === input.experienceFormat && before.formatContractVersion === 1)
		return before
	const after = { experienceFormat: input.experienceFormat, formatContractVersion: 1 }
	await tx
		.insert(Tour)
		.values({ productId: input.productId, ...after })
		.onConflictDoUpdate({ target: Tour.productId, set: after })
	await tx.insert(ProviderAuditLog).values({
		id: crypto.randomUUID(),
		providerId: input.providerId,
		actorUserId: input.actorUserId,
		action: "experience.format.declared",
		entityType: "product",
		entityId: input.productId,
		beforeJson: before ?? null,
		afterJson: after,
		riskLevel: "high",
	})
	return after
}
