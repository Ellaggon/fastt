/**
 * Loads the facts the resolver needs: enrolled lines, holder, every tour
 * context and the resources assigned to those departures. The tour list is
 * not capped.
 */

import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	commercialLinesForProductTypes,
	collectionModelForCommercialLine,
	readProviderCommercialLineState,
	sortCommercialLines,
	type CommercialLine,
} from "@/lib/verification/commercial-lines"
import {
	resolveVerificationRequirements,
	type TourVerificationContext,
	type VerificationResolution,
} from "@/lib/verification/requirement-resolver"
import {
	and,
	db,
	eq,
	first,
	Product,
	ProviderTaxConfiguration,
	TourComplianceContext,
	TourResourceAssignment,
	Variant,
} from "@/shared/infrastructure/db/compat"

export type LoadedVerificationResolution = {
	/** False when the commercial-line table is not in this database yet. */
	available: boolean
	/**
	 * True once the account has a holder or an enrolled line. Until then the
	 * screens keep the previous document list.
	 */
	enforced: boolean
	lines: CommercialLine[]
	resolution: VerificationResolution | null
}

function missingRelation(error: unknown, relation: string) {
	return String(error).includes(`relation "${relation}" does not exist`)
}

function activityClasses(value: unknown): string[] {
	if (typeof value === "string") {
		try {
			return activityClasses(JSON.parse(value))
		} catch {
			return []
		}
	}
	if (!Array.isArray(value)) return []
	return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))]
}

async function loadTourVerificationContexts(
	providerId: string
): Promise<TourVerificationContext[]> {
	let products: Array<{ id: string }> = []
	try {
		products = await db
			.select({ id: Product.id })
			.from(Product)
			.where(and(eq(Product.providerId, providerId), eq(Product.productType, "tour")))
	} catch (error) {
		if (!missingRelation(error, "Product")) throw error
	}

	const productIds = products.map((row) => row.id).filter(Boolean)
	if (productIds.length === 0) return []

	const [contexts, resources] = await Promise.all([
		db
			.select({
				productId: TourComplianceContext.productId,
				operatingRole: TourComplianceContext.operatingRole,
				activityClassesJson: TourComplianceContext.activityClassesJson,
				jurisdictionCode: TourComplianceContext.jurisdictionCode,
			})
			.from(TourComplianceContext)
			.where(eq(TourComplianceContext.providerId, providerId))
			.then((rows) => rows)
			.catch((error: unknown) => {
				if (missingRelation(error, "TourComplianceContext")) return []
				throw error
			}),
		db
			.select({
				productId: Variant.productId,
				resourceId: TourResourceAssignment.resourceId,
			})
			.from(TourResourceAssignment)
			.innerJoin(Variant, eq(Variant.id, TourResourceAssignment.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Product.providerId, providerId), eq(Product.productType, "tour")))
			.then((rows) => rows)
			.catch((error: unknown) => {
				if (missingRelation(error, "TourResourceAssignment") || missingRelation(error, "Variant")) {
					return []
				}
				throw error
			}),
	])

	const contextByProduct = new Map(contexts.map((row) => [row.productId, row]))
	const resourcesByProduct = new Map<string, string[]>()
	for (const row of resources) {
		const productId = String(row.productId ?? "").trim()
		const resourceId = String(row.resourceId ?? "").trim()
		if (!productId || !resourceId) continue
		const current = resourcesByProduct.get(productId) ?? []
		if (!current.includes(resourceId)) current.push(resourceId)
		resourcesByProduct.set(productId, current)
	}

	return productIds.map((productId) => {
		const context = contextByProduct.get(productId)
		const role = String(context?.operatingRole ?? "").trim()
		return {
			productId,
			operatingRole:
				role === "operator" || role === "guide" || role === "intermediary" ? role : null,
			activityClasses: activityClasses(context?.activityClassesJson),
			jurisdictionCode: String(context?.jurisdictionCode ?? "").trim() || null,
			departureResourceIds: resourcesByProduct.get(productId) ?? [],
		}
	})
}

function holderFacts(holder: Awaited<ReturnType<typeof readProviderHolderProfile>>): {
	holderType: "persona_natural" | "entidad" | null
	holderCountry: string | null
	taxResidenceCountry: string | null
	present: boolean
} {
	const holderType =
		holder?.holderType === "persona_natural" || holder?.holderType === "entidad"
			? holder.holderType
			: null
	return {
		holderType,
		holderCountry: holder?.holderCountry ?? null,
		taxResidenceCountry: holder?.taxResidenceCountry ?? null,
		present: Boolean(holder),
	}
}

async function productLinesForProvider(providerId: string): Promise<CommercialLine[]> {
	try {
		const rows = await db
			.select({ productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, providerId))
		return commercialLinesForProductTypes(rows.map((row) => row.productType))
	} catch (error) {
		if (missingRelation(error, "Product")) return []
		throw error
	}
}

export async function loadProviderVerificationResolution(
	providerId: string
): Promise<LoadedVerificationResolution> {
	const state = await readProviderCommercialLineState(providerId)
	const [holder, tours, taxConfiguration, productLines] = await Promise.all([
		readProviderHolderProfile(providerId).catch(() => null),
		loadTourVerificationContexts(providerId),
		db
			.select({ taxResidenceCountry: ProviderTaxConfiguration.taxResidenceCountry })
			.from(ProviderTaxConfiguration)
			.where(eq(ProviderTaxConfiguration.providerId, providerId))
			.then(first)
			.catch((error: unknown) => {
				if (missingRelation(error, "ProviderTaxConfiguration")) return null
				throw error
			}),
		productLinesForProvider(providerId),
	])
	const facts = holderFacts(holder)
	const enrolled = state.available ? state.lines.map((row) => row.line) : []
	const lines = sortCommercialLines([...new Set<CommercialLine>([...enrolled, ...productLines])])
	const enforced = lines.length > 0 || facts.present
	const taxResidenceCountry =
		facts.taxResidenceCountry || taxConfiguration?.taxResidenceCountry || null
	// Shared requirements become payment-related only if at least one enrolled
	// line explicitly declares Fastt collection. The selected line determines
	// whether the payments tab is shown by the workspace.
	const collectionModel = state.lines.some(
		(line) => collectionModelForCommercialLine(state.lines, line.line) === "platform_collect"
	)
		? "platform_collect"
		: state.lines.some(
					(line) => collectionModelForCommercialLine(state.lines, line.line) === "property_collect"
			  )
			? "property_collect"
			: "undecided"
	return {
		available: state.available,
		enforced,
		lines,
		resolution: resolveVerificationRequirements({
			lines,
			holderType: facts.holderType,
			holderCountry: facts.holderCountry,
			taxResidenceCountry,
			collectionModel,
			tours,
		}),
	}
}
