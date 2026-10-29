import {
	and,
	db,
	eq,
	first,
	Product,
	ProviderUser,
	TourComplianceContext,
	TourOperationalResource,
	inArray,
} from "@/shared/infrastructure/db/compat"
import { assertOperatingPlaces } from "@/lib/tours/operating-geography"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import {
	operationActivityClasses,
	operationRole,
	operationSubjects,
	operationResourceIssue,
	tourOperationSchema,
	type TourOperation,
	projectOperationContext,
	tourOperatingRoles,
	tourComplianceActivityClasses,
} from "@/shared/domain/tour-operation"

export {
	tourOperatingRoles,
	tourComplianceActivityClasses,
	tourComplianceActivityLabels,
} from "@/shared/domain/tour-operation"

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
	jurisdictionCodes?: unknown
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
	const jurisdictionCodes = list(
		input.jurisdictionCodes ?? (input.jurisdictionCode ? [input.jurisdictionCode] : [])
	)
	if (
		jurisdictionCodes.length > 100 ||
		jurisdictionCodes.some((code) => code.length > 200 || !code.trim())
	)
		throw new Error("invalid_tour_jurisdiction")
	return {
		operatingRole: operatingRole as TourOperatingRole | null,
		activityClasses: activityClasses as TourComplianceActivityClass[],
		jurisdictionCode: jurisdictionCodes[0] || null,
		jurisdictionCodes,
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
		.then((context) => (context ? projectOperationContext(context) : context))
}

export async function saveTourComplianceContext(params: {
	productId: string
	providerId: string
	input: ReturnType<typeof parseTourComplianceContext>
	operation: TourOperation
	expectedRevision: number
	actorUserId: string
}) {
	const now = new Date()
	if (
		!params.actorUserId.trim() ||
		!Number.isSafeInteger(params.expectedRevision) ||
		params.expectedRevision < 0
	)
		throw new Error("invalid_tour_revision")
	const declaration = parseTourComplianceContext(params.input)
	return withPostgresTransaction(async () => {
		const tx = db
		const owned = await tx
			.select({ id: Product.id })
			.from(Product)
			.where(
				and(
					eq(Product.id, params.productId),
					eq(Product.providerId, params.providerId),
					eq(Product.productType, "tour")
				)
			)
			.for("update")
			.then(first)
		if (!owned) throw new Error("tour_context_not_found")
		await assertOperatingPlaces(declaration.jurisdictionCodes)
		const membership = await tx
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(
				and(
					eq(ProviderUser.providerId, params.providerId),
					eq(ProviderUser.userId, params.actorUserId)
				)
			)
			.for("share")
			.then(first)
		if (!membership || !resolveProviderPermissions(membership).canEditProfile)
			throw new Error("tour_context_forbidden")
		const operation = tourOperationSchema.parse(params.operation)
		const previous = await readTourComplianceContext(params.productId, params.providerId)
		if ((previous?.revision ?? 0) !== params.expectedRevision)
			throw new Error("tour_context_conflict")
		const ids = operationSubjects(operation)
		const resources = ids.length
			? await tx
					.select()
					.from(TourOperationalResource)
					.where(
						and(
							eq(TourOperationalResource.providerId, params.providerId),
							eq(TourOperationalResource.status, "active"),
							inArray(TourOperationalResource.id, ids)
						)
					)
					.for("share")
			: []
		const resourceIssue = operationResourceIssue(operation, resources)
		if (resourceIssue) throw new Error(resourceIssue)
		const role = operationRole(operation)
		const activities = operationActivityClasses(operation)
		if (!declaration.jurisdictionCodes.length || !activities.length)
			throw new Error("invalid_tour_context")
		const values = {
			operatingRole: role,
			activityClassesJson: activities,
			jurisdictionCode: declaration.jurisdictionCode,
			jurisdictionCodes: declaration.jurisdictionCodes,
			operationJson: operation,
			revision: params.expectedRevision + 1,
			updatedAt: now,
		}
		await tx
			.insert(TourComplianceContext)
			.values({
				productId: params.productId,
				providerId: params.providerId,
				...values,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: TourComplianceContext.productId,
				set: values,
				setWhere: eq(TourComplianceContext.providerId, params.providerId),
			})
		const saved = await tx
			.select()
			.from(TourComplianceContext)
			.where(
				and(
					eq(TourComplianceContext.productId, params.productId),
					eq(TourComplianceContext.providerId, params.providerId)
				)
			)
			.then(first)
		if (!saved) throw new Error("tour_context_owner_mismatch")
		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "tour_operation.updated",
			entityType: "TourComplianceContext",
			entityId: params.productId,
			beforeJson: previous ?? null,
			afterJson: saved,
			riskLevel: "high",
		})
		return saved
	})
}
