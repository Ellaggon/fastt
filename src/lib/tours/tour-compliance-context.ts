import { and, db, eq, first, TourComplianceContext } from "@/shared/infrastructure/db/compat"
import { tourOperatingTerritory } from "@/lib/tours/tour-operating-territories"

export const tourOperatingRoles = ["operator", "guide", "intermediary"] as const
export const tourComplianceActivityClasses = [
	"urban_cultural",
	"guided_nature",
	"adventure",
	"transport",
	"water_air",
	"gastronomic",
] as const

export const tourComplianceActivityLabels: Record<
	(typeof tourComplianceActivityClasses)[number],
	string
> = {
	urban_cultural: "Cultura y ciudad",
	guided_nature: "Naturaleza guiada",
	adventure: "Aventura",
	transport: "Transporte operado",
	water_air: "Agua o aire",
	gastronomic: "Gastronomía",
}

export type TourOperatingRole = (typeof tourOperatingRoles)[number]
export type TourComplianceActivityClass = (typeof tourComplianceActivityClasses)[number]

export function storedTourActivityClasses(value: unknown): TourComplianceActivityClass[] {
	if (typeof value === "string") {
		try {
			return storedTourActivityClasses(JSON.parse(value))
		} catch {
			return []
		}
	}
	if (!Array.isArray(value)) return []
	return [
		...new Set(
			value.filter((item): item is TourComplianceActivityClass =>
				tourComplianceActivityClasses.includes(item as TourComplianceActivityClass)
			)
		),
	]
}

function list(value: unknown): string[] {
	return Array.isArray(value)
		? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))]
		: []
}

export function parseTourComplianceContext(input: {
	operatingRole?: unknown
	activityClasses?: unknown
	jurisdictionCode?: unknown
}) {
	const rawRole = String(input.operatingRole ?? "").trim()
	const operatingRole = rawRole || null
	if (operatingRole && !tourOperatingRoles.includes(operatingRole as TourOperatingRole))
		throw new Error("invalid_tour_operating_role")
	const activityClasses = list(input.activityClasses)
	if (
		activityClasses.length > 12 ||
		activityClasses.some(
			(item) => !tourComplianceActivityClasses.includes(item as TourComplianceActivityClass)
		)
	)
		throw new Error("invalid_tour_activity_class")
	const jurisdictionCode = String(input.jurisdictionCode ?? "").trim()
	if (jurisdictionCode && !tourOperatingTerritory(jurisdictionCode))
		throw new Error("invalid_tour_jurisdiction")
	return {
		operatingRole: operatingRole as TourOperatingRole | null,
		activityClasses: activityClasses as TourComplianceActivityClass[],
		jurisdictionCode: jurisdictionCode || null,
	}
}

export async function readTourComplianceContext(productId: string, providerId: string) {
	return db
		.select()
		.from(TourComplianceContext)
		.where(
			and(
				eq(TourComplianceContext.productId, productId),
				eq(TourComplianceContext.providerId, providerId)
			)
		)
		.then(first)
}

export async function saveTourComplianceContext(params: {
	productId: string
	providerId: string
	input: ReturnType<typeof parseTourComplianceContext>
}) {
	const now = new Date()
	await db
		.insert(TourComplianceContext)
		.values({
			productId: params.productId,
			providerId: params.providerId,
			operatingRole: params.input.operatingRole,
			activityClassesJson: params.input.activityClasses,
			jurisdictionCode: params.input.jurisdictionCode,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: TourComplianceContext.productId,
			set: {
				providerId: params.providerId,
				operatingRole: params.input.operatingRole,
				activityClassesJson: params.input.activityClasses,
				jurisdictionCode: params.input.jurisdictionCode,
				updatedAt: now,
			},
		})
	return readTourComplianceContext(params.productId, params.providerId)
}
