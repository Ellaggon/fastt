import { and, db, eq, TaxFeeAssignment, TaxFeeDefinition } from "@/shared/infrastructure/db/compat"
import {
	getRecommendedFiscalSimulationContext,
	type FiscalSimulationContext,
	type FiscalSimulationIssue,
	type FiscalWorkspaceResources,
} from "@/lib/taxes-fees/fiscal-workspace-resources"

export type FiscalSimulationNotice = {
	variant: "warning" | "info" | "neutral"
	title: string
	intro: string
	footer: string | null
	allowsManualFallback: boolean
}

export type FiscalSimulationCoverage = "account" | "assigned" | "none"

export type FiscalSimulationTarget = {
	preferredProductId: string | null
	preferredVariantId: string | null
	preferredRatePlanId: string | null
	restrictToTarget: boolean
	coverage: FiscalSimulationCoverage
	assignedProductIds: string[]
	assignedProductLabels: string[]
	workspaceMismatch: boolean
	workspaceProductLabel: string | null
}

export type FiscalSimulationAssignmentInput = {
	scope: string
	scopeId: string | null
	status: string
}

export type FiscalSimulationDefinitionInput = {
	id: string
	name: string
	value: number
	jurisdictionCountry: string
	assignments: FiscalSimulationAssignmentInput[]
}

export type FiscalSimulationReadiness = {
	context: FiscalSimulationContext | null
	issues: FiscalSimulationIssue[]
	coverageIssues: FiscalSimulationIssue[]
	notice: FiscalSimulationNotice | null
	target: FiscalSimulationTarget
}

const COMMERCIAL_DESCRIPTION: Record<string, (name: string) => string> = {
	missing_product: (name) => `Crea un producto antes de comprobar ${name}.`,
	missing_variant: (name) => `Asocia una habitación o salida a una tarifa para probar ${name}.`,
	missing_active_rate_plan: (name) =>
		`Activa o crea una tarifa para obtener un precio de prueba de ${name}.`,
	missing_calendar: (name) =>
		`Esta tarifa aún no tiene fechas con precio y cupo en las próximas cuatro semanas para certificar ${name}.`,
	missing_availability: (name) =>
		`Necesitas dos noches seguidas con cupo en las próximas cuatro semanas para certificar ${name}.`,
	missing_price: (name) =>
		`Pon un precio mayor que cero en esas mismas dos noches seguidas para certificar ${name}.`,
	no_matching_stay: (name) =>
		`Pon precio y cupo en las mismas dos noches seguidas de las próximas cuatro semanas para certificar ${name}.`,
}

export function jurisdictionCountryFromJson(value: unknown) {
	if (!value || typeof value !== "object") return ""
	const country = (value as { country?: unknown }).country
	return typeof country === "string" ? country.trim().toUpperCase() : ""
}

export function isFiscalDefinitionComplete(definition: FiscalSimulationDefinitionInput) {
	return Boolean(definition.name.trim() && definition.value > 0 && definition.jurisdictionCountry)
}

export function resolveFiscalSimulationTarget(input: {
	definition: FiscalSimulationDefinitionInput
	resources: FiscalWorkspaceResources
	workspaceProductId?: string | null
}): FiscalSimulationTarget {
	const workspaceProduct = input.resources.products.find(
		(product) => product.id === input.workspaceProductId
	)
	const activeAssignments = input.definition.assignments.filter(
		(assignment) => assignment.status === "active"
	)
	const coversAccount = activeAssignments.some(
		(assignment) => assignment.scope === "provider" || assignment.scope === "global"
	)
	const assignedProducts = new Map<string, string>()
	let preferredVariantId: string | null = null
	let preferredRatePlanId: string | null = null

	for (const assignment of activeAssignments) {
		if (assignment.scope === "product" && assignment.scopeId) {
			const product = input.resources.products.find((item) => item.id === assignment.scopeId)
			if (product) assignedProducts.set(product.id, product.label)
		}
		if (assignment.scope === "variant" && assignment.scopeId) {
			const variant = input.resources.variants.find((item) => item.id === assignment.scopeId)
			if (!variant) continue
			const product = input.resources.products.find((item) => item.id === variant.productId)
			if (product) assignedProducts.set(product.id, product.label)
			if (!preferredVariantId) preferredVariantId = variant.id
		}
		if (assignment.scope === "rate_plan" && assignment.scopeId) {
			const plan = input.resources.ratePlans.find((item) => item.id === assignment.scopeId)
			if (!plan) continue
			const product = input.resources.products.find((item) => item.id === plan.productId)
			if (product) assignedProducts.set(product.id, product.label)
			if (!preferredRatePlanId) preferredRatePlanId = plan.id
			if (!preferredVariantId) preferredVariantId = plan.variantId
		}
	}

	if (coversAccount || assignedProducts.size === 0) {
		return {
			preferredProductId: workspaceProduct?.id ?? input.resources.products[0]?.id ?? null,
			preferredVariantId: null,
			preferredRatePlanId: null,
			restrictToTarget: Boolean(workspaceProduct),
			coverage: coversAccount ? "account" : "none",
			assignedProductIds: [],
			assignedProductLabels: [],
			workspaceMismatch: false,
			workspaceProductLabel: workspaceProduct?.label ?? null,
		}
	}

	const assignedProductIds = [...assignedProducts.keys()]
	const assignedInWorkspace =
		workspaceProduct && assignedProducts.has(workspaceProduct.id) ? workspaceProduct.id : null
	const preferredProductId = assignedInWorkspace ?? assignedProductIds[0] ?? null
	if (preferredProductId) {
		const plan = preferredRatePlanId
			? input.resources.ratePlans.find((item) => item.id === preferredRatePlanId)
			: null
		if (plan && plan.productId !== preferredProductId) {
			preferredRatePlanId = null
			preferredVariantId = null
		}
		const variant = preferredVariantId
			? input.resources.variants.find((item) => item.id === preferredVariantId)
			: null
		if (variant && variant.productId !== preferredProductId) preferredVariantId = null
	}

	return {
		preferredProductId,
		preferredVariantId,
		preferredRatePlanId,
		restrictToTarget: true,
		coverage: "assigned",
		assignedProductIds,
		assignedProductLabels: [...assignedProducts.values()],
		workspaceMismatch: Boolean(workspaceProduct && !assignedProducts.has(workspaceProduct.id)),
		workspaceProductLabel: workspaceProduct?.label ?? null,
	}
}

export function buildFiscalDefinitionIssues(input: {
	definition: FiscalSimulationDefinitionInput
	workspaceProductId?: string | null
}): FiscalSimulationIssue[] {
	const issues: FiscalSimulationIssue[] = []
	const params = new URLSearchParams({ edit: input.definition.id })
	if (input.workspaceProductId) params.set("scope", input.workspaceProductId)
	const href = `/provider/settings/tax-fees?${params.toString()}`
	if (!input.definition.jurisdictionCountry) {
		issues.push({
			id: "missing_jurisdiction",
			kind: "fiscal",
			title: `Falta la jurisdicción de ${input.definition.name}`,
			description: "Sin país no se puede comprobar cuánto se cobra ni certificar esta versión.",
			actionLabel: "Completar jurisdicción",
			href,
		})
	} else if (!isFiscalDefinitionComplete(input.definition)) {
		issues.push({
			id: "incomplete_definition",
			kind: "fiscal",
			title: `Falta completar ${input.definition.name}`,
			description: "La regla necesita un nombre, un importe y la jurisdicción para certificarla.",
			actionLabel: "Completar definición",
			href,
		})
	}
	return issues
}

export function buildFiscalCoverageIssues(input: {
	definition: FiscalSimulationDefinitionInput
	target: FiscalSimulationTarget
	workspaceProductId?: string | null
}): FiscalSimulationIssue[] {
	const params = new URLSearchParams({ definitionId: input.definition.id })
	if (input.workspaceProductId) params.set("scope", input.workspaceProductId)
	const href = `/provider/settings/tax-fees/assignments?${params.toString()}`
	if (input.target.coverage === "none") {
		return [
			{
				id: "unassigned",
				kind: "coverage",
				title: "Sin cobertura de venta",
				description: `${input.definition.name} no se cobrará en reservas hasta que lo asignes a un producto, unidad o tarifa. La simulación sirve igual para el cálculo.`,
				actionLabel: "Ver asignaciones",
				href,
			},
		]
	}
	if (!input.target.workspaceMismatch) return []
	const assignedLabel = input.target.assignedProductLabels.join(", ")
	return [
		{
			id: "coverage_other_product",
			kind: "coverage",
			title: `${input.definition.name} no cubre ${input.target.workspaceProductLabel}`,
			description: `Está asignado a ${assignedLabel}. La cotización certificable se prepara sobre esa cobertura, no sobre ${input.target.workspaceProductLabel}.`,
			actionLabel: "Ver asignaciones",
			href,
		},
	]
}

export function personalizeCommercialIssues(
	issues: FiscalSimulationIssue[],
	definitionName: string
): FiscalSimulationIssue[] {
	return issues.map((issue) => {
		const describe = COMMERCIAL_DESCRIPTION[issue.id]
		return describe ? { ...issue, description: describe(definitionName) } : issue
	})
}

export function buildFiscalSimulationNotice(input: {
	definitionName: string
	fiscalIssues: FiscalSimulationIssue[]
	commercialIssues: FiscalSimulationIssue[]
}): FiscalSimulationNotice | null {
	if (input.fiscalIssues.length && input.commercialIssues.length) {
		return {
			variant: "warning",
			title: `Falta completar ${input.definitionName}`,
			intro: `Antes de certificar ${input.definitionName}, termina la configuración fiscal y estas condiciones comerciales:`,
			footer: `También puedes usar un importe de prueba para revisar solo el cálculo de ${input.definitionName}; esa opción no certifica búsqueda ni checkout.`,
			allowsManualFallback: true,
		}
	}
	if (input.fiscalIssues.length) {
		return {
			variant: "warning",
			title: `Falta completar ${input.definitionName}`,
			intro: `Antes de certificar ${input.definitionName}, termina la configuración fiscal:`,
			footer: null,
			allowsManualFallback: false,
		}
	}
	if (input.commercialIssues.length) {
		return {
			variant: "warning",
			title: "Falta preparar una cotización real",
			intro: `Para certificar ${input.definitionName} con una cotización igual a búsqueda y checkout, completa estas condiciones comerciales:`,
			footer: `También puedes usar un importe de prueba para revisar solo el cálculo de ${input.definitionName}; esa opción no certifica búsqueda ni checkout.`,
			allowsManualFallback: true,
		}
	}
	return null
}

export function composeFiscalSimulationReadiness(input: {
	definition: FiscalSimulationDefinitionInput
	resources: FiscalWorkspaceResources
	workspaceProductId?: string | null
	commercial: {
		context: FiscalSimulationContext | null
		issues: FiscalSimulationIssue[]
	}
}): FiscalSimulationReadiness {
	const target = resolveFiscalSimulationTarget({
		definition: input.definition,
		resources: input.resources,
		workspaceProductId: input.workspaceProductId,
	})
	const fiscalIssues = buildFiscalDefinitionIssues({
		definition: input.definition,
		workspaceProductId: input.workspaceProductId,
	})
	const commercialIssues = input.commercial.context
		? []
		: personalizeCommercialIssues(input.commercial.issues, input.definition.name)
	const coverageIssues = buildFiscalCoverageIssues({
		definition: input.definition,
		target,
		workspaceProductId: input.workspaceProductId,
	})
	return {
		context: input.commercial.context,
		issues: [...fiscalIssues, ...commercialIssues],
		coverageIssues,
		notice: buildFiscalSimulationNotice({
			definitionName: input.definition.name,
			fiscalIssues,
			commercialIssues,
		}),
		target,
	}
}

export async function loadFiscalSimulationDefinition(
	providerId: string,
	definitionId: string
): Promise<FiscalSimulationDefinitionInput | null> {
	const definition = await db
		.select({
			id: TaxFeeDefinition.id,
			name: TaxFeeDefinition.name,
			value: TaxFeeDefinition.value,
			jurisdictionJson: TaxFeeDefinition.jurisdictionJson,
		})
		.from(TaxFeeDefinition)
		.where(and(eq(TaxFeeDefinition.id, definitionId), eq(TaxFeeDefinition.providerId, providerId)))
		.then((rows) => rows[0] ?? null)
	if (!definition) return null
	const assignments = await db
		.select({
			scope: TaxFeeAssignment.scope,
			scopeId: TaxFeeAssignment.scopeId,
			status: TaxFeeAssignment.status,
		})
		.from(TaxFeeAssignment)
		.where(eq(TaxFeeAssignment.taxFeeDefinitionId, definition.id))
	return {
		id: definition.id,
		name: String(definition.name || "Esta regla"),
		value: Number(definition.value ?? 0),
		jurisdictionCountry: jurisdictionCountryFromJson(definition.jurisdictionJson),
		assignments: assignments.map((assignment) => ({
			scope: String(assignment.scope || ""),
			scopeId: assignment.scopeId ? String(assignment.scopeId) : null,
			status: String(assignment.status || "archived"),
		})),
	}
}

export async function getFiscalSimulationReadiness(input: {
	providerId: string
	definitionId: string
	resources: FiscalWorkspaceResources
	workspaceProductId?: string | null
	manualMode?: boolean
}): Promise<FiscalSimulationReadiness | null> {
	const definition = await loadFiscalSimulationDefinition(input.providerId, input.definitionId)
	if (!definition) return null
	const target = resolveFiscalSimulationTarget({
		definition,
		resources: input.resources,
		workspaceProductId: input.workspaceProductId,
	})
	const commercial = input.manualMode
		? { context: null, issues: [] }
		: await getRecommendedFiscalSimulationContext({
				resources: input.resources,
				preferredProductId: target.restrictToTarget ? target.preferredProductId : null,
				preferredVariantId: target.restrictToTarget ? target.preferredVariantId : null,
				preferredRatePlanId: target.restrictToTarget ? target.preferredRatePlanId : null,
			})
	return composeFiscalSimulationReadiness({
		definition,
		resources: input.resources,
		workspaceProductId: input.workspaceProductId,
		commercial,
	})
}
