import { z } from "zod"

export const tourOperatingRoles = ["operator", "guide", "intermediary"] as const
export const tourComplianceActivityClasses = [
	"urban_cultural",
	"guided_nature",
	"adventure",
	"transport",
	"water_air",
	"water",
	"air",
	"transport_subcontracted",
	"gastronomic",
	"general_experience",
] as const
export const tourComplianceActivityLabels: Record<
	(typeof tourComplianceActivityClasses)[number],
	string
> = {
	urban_cultural: "Cultura y ciudad",
	guided_nature: "Naturaleza guiada",
	adventure: "Aventura",
	transport: "Transporte operado",
	water_air: "Agua o aire (declaración anterior)",
	water: "Actividades acuáticas",
	air: "Actividades aéreas",
	transport_subcontracted: "Transporte subcontratado",
	gastronomic: "Gastronomía",
	general_experience: "Operación general",
}

export const executionModes = ["self", "team", "external"] as const
export const operationCharacteristics = [
	{ value: "urban_cultural", label: "Recorrido cultural o urbano" },
	{ value: "guided_nature", label: "Recorrido en la naturaleza" },
	{ value: "adventure", label: "Actividad de aventura" },
] as const
export const executionLabels = {
	self: "Yo personalmente",
	team: "Mi negocio, con su equipo",
	external: "Otro prestador",
} as const

export const transportServiceSchema = z
	.object({
		id: z.string().uuid(),
		label: z.string().trim().min(2).max(120),
		providedBy: z.enum(["business", "external"]),
		operatorResourceId: z.string().uuid().nullable(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if ((value.providedBy === "external") !== Boolean(value.operatorResourceId))
			ctx.addIssue({
				code: "custom",
				path: ["operatorResourceId"],
				message: "Selecciona el transportista responsable.",
			})
	})

export const tourOperationSchema = z
	.object({
		version: z.literal(2),
		executionMode: z.enum(executionModes),
		guidingService: z.boolean(),
		characteristics: z.array(z.enum(["urban_cultural", "guided_nature", "adventure"])).max(3),
		operatorResourceId: z.string().uuid().nullable(),
		waterActivity: z.boolean(),
		airActivity: z.boolean(),
		foodHandling: z.enum(["none", "visit", "serve", "prepare"]),
		transportServices: z.array(transportServiceSchema).max(20),
		resourceIds: z.array(z.string().uuid()).max(100),
	})
	.strict()
	.superRefine((value, ctx) => {
		if ((value.executionMode === "external") !== Boolean(value.operatorResourceId))
			ctx.addIssue({
				code: "custom",
				path: ["operatorResourceId"],
				message: "Identifica al prestador que realiza la experiencia.",
			})
		if (
			new Set(value.transportServices.map((service) => service.id)).size !==
			value.transportServices.length
		)
			ctx.addIssue({
				code: "custom",
				path: ["transportServices"],
				message: "Hay servicios de transporte duplicados.",
			})
		if (new Set(value.resourceIds).size !== value.resourceIds.length)
			ctx.addIssue({ code: "custom", path: ["resourceIds"], message: "Hay recursos duplicados." })
	})
export type TourOperation = z.infer<typeof tourOperationSchema>

export function readTourOperation(value: unknown): TourOperation | null {
	const parsed = tourOperationSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

export function operationRole(operation: TourOperation) {
	return operation.executionMode === "external"
		? "intermediary"
		: operation.executionMode === "self" && operation.guidingService
			? "guide"
			: "operator"
}

export function operationSubjects(operation: TourOperation) {
	return [
		...new Set(
			[
				operation.operatorResourceId,
				...operation.transportServices.map((service) => service.operatorResourceId),
				...operation.resourceIds,
			].filter((id): id is string => Boolean(id))
		),
	]
}

export function operationResourceIssue(
	operation: TourOperation,
	resources: Array<{ id: string; type: string }>
): "invalid_tour_resource" | "invalid_tour_operator" | null {
	const byId = new Map(resources.map((resource) => [resource.id, resource.type]))
	if (operationSubjects(operation).some((id) => !byId.has(id))) return "invalid_tour_resource"
	const operators = [
		operation.operatorResourceId,
		...operation.transportServices.map((service) => service.operatorResourceId),
	].filter((id): id is string => Boolean(id))
	if (operators.some((id) => byId.get(id) !== "service_operator")) return "invalid_tour_operator"
	if (operation.resourceIds.some((id) => byId.get(id) === "service_operator"))
		return "invalid_tour_resource"
	return null
}

/** No legacy water/air or transport values are inferred from an ambiguous declaration. */
export function operationActivityClasses(operation: TourOperation) {
	const classes = [
		...new Set([
			...operation.characteristics,
			...(operation.waterActivity ? ["water"] : []),
			...(operation.airActivity ? ["air"] : []),
			...(operation.transportServices.some((service) => service.providedBy === "business")
				? ["transport"]
				: []),
			...(operation.transportServices.some((service) => service.providedBy === "external")
				? ["transport_subcontracted"]
				: []),
			...(operation.foodHandling !== "none" ? ["gastronomic"] : []),
		]),
	]
	return classes.length ? classes : ["general_experience"]
}

export function projectOperationContext<
	T extends { operationJson?: unknown; operatingRole: string | null; activityClassesJson: unknown },
>(context: T): T {
	if (context.operationJson == null) return context
	const operation = readTourOperation(context.operationJson)
	return {
		...context,
		operatingRole: operation ? operationRole(operation) : null,
		activityClassesJson: operation ? operationActivityClasses(operation) : [],
	}
}

export const externalOperatorIdentitySchema = z
	.object({
		country: z.string().regex(/^[A-Z]{2}$/),
		registrationId: z.string().trim().max(100).nullable(),
	})
	.strict()
