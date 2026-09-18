import { db, eq, first, ProviderHolderProfile } from "@/shared/infrastructure/db/compat"
import { writeProviderAuditLog } from "@/lib/provider-audit"

export type HolderType = "persona_natural" | "entidad"
export type HolderDeclaration = {
	holderType: HolderType
	holderCountry: string
	taxResidenceCountry: string | null
	payoutCountry: string | null
	collectionModel: "undecided" | "property_collect" | "platform_collect"
}

function country(value: FormDataEntryValue | null): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toUpperCase()
	return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

/**
 * Identity captures the holder and jurisdictions only. Collection is deliberately
 * initialized as undecided here; a payment-contract flow owns that later decision.
 */
export function parseHolderDeclaration(form: FormData): HolderDeclaration | null {
	if (!form.has("holderType") && !form.has("holderCountry")) return null
	const holderType = String(form.get("holderType") ?? "")
	const holderCountry = country(form.get("holderCountry"))
	if ((holderType !== "persona_natural" && holderType !== "entidad") || !holderCountry) {
		throw new Error("holder_declaration_invalid")
	}
	const taxRaw = String(form.get("taxResidenceCountry") ?? "").trim()
	const payoutRaw = String(form.get("payoutCountry") ?? "").trim()
	const taxResidenceCountry = taxRaw ? country(form.get("taxResidenceCountry")) : null
	const payoutCountry = payoutRaw ? country(form.get("payoutCountry")) : null
	if ((taxRaw && !taxResidenceCountry) || (payoutRaw && !payoutCountry)) {
		throw new Error("holder_declaration_invalid")
	}
	return {
		holderType,
		holderCountry,
		taxResidenceCountry,
		payoutCountry,
		collectionModel: "undecided",
	}
}

/** Identity edits must never reset a payment-contract decision already on file. */
export function collectionModelForIdentitySave(
	existing: { collectionModel?: unknown } | null | undefined
) {
	const collectionModel = existing?.collectionModel
	return collectionModel === "property_collect" || collectionModel === "platform_collect"
		? collectionModel
		: "undecided"
}

export async function readProviderHolderProfile(providerId: string) {
	try {
		return await db
			.select()
			.from(ProviderHolderProfile)
			.where(eq(ProviderHolderProfile.providerId, providerId))
			.then(first)
	} catch (error) {
		if (String(error).includes('relation "ProviderHolderProfile" does not exist')) {
			return null
		}
		throw error
	}
}

export async function assertHolderStorageAvailable() {
	try {
		await db
			.select({ providerId: ProviderHolderProfile.providerId })
			.from(ProviderHolderProfile)
			.limit(1)
	} catch (error) {
		if (String(error).includes('relation "ProviderHolderProfile" does not exist')) {
			throw new Error("HOLDER_STORAGE_MIGRATION_REQUIRED")
		}
		throw error
	}
}

export async function isHolderStorageAvailable(): Promise<boolean> {
	try {
		await assertHolderStorageAvailable()
		return true
	} catch (error) {
		if (error instanceof Error && error.message === "HOLDER_STORAGE_MIGRATION_REQUIRED")
			return false
		throw error
	}
}

export async function saveProviderHolderProfile(params: {
	providerId: string
	userId: string
	declaration: HolderDeclaration
}) {
	const previous = await readProviderHolderProfile(params.providerId)
	const changed = Boolean(
		previous &&
		(previous.holderType !== params.declaration.holderType ||
			previous.holderCountry !== params.declaration.holderCountry ||
			previous.taxResidenceCountry !== params.declaration.taxResidenceCountry ||
			previous.payoutCountry !== params.declaration.payoutCountry ||
			previous.collectionModel !== params.declaration.collectionModel)
	)
	await db
		.insert(ProviderHolderProfile)
		.values({
			providerId: params.providerId,
			...params.declaration,
			declaredByUserId: params.userId,
			declarationStatus: "declared",
		})
		.onConflictDoUpdate({
			target: ProviderHolderProfile.providerId,
			set: {
				...params.declaration,
				declaredByUserId: params.userId,
				declarationStatus: changed ? "in_review" : (previous?.declarationStatus ?? "declared"),
				updatedAt: new Date(),
			},
		})
	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.userId,
		action: changed ? "provider.holder_declaration_changed" : "provider.holder_declaration_saved",
		entityType: "ProviderHolderProfile",
		entityId: params.providerId,
		beforeJson: previous
			? {
					holderType: previous.holderType,
					holderCountry: previous.holderCountry,
					taxResidenceCountry: previous.taxResidenceCountry,
					payoutCountry: previous.payoutCountry,
					collectionModel: previous.collectionModel,
				}
			: null,
		afterJson: params.declaration,
		riskLevel: changed ? "high" : "medium",
	})
	return { changed, status: changed ? "in_review" : (previous?.declarationStatus ?? "declared") }
}
