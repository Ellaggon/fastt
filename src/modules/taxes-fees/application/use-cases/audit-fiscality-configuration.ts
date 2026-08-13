import type { TaxFeeDefinition } from "../../domain/tax-fee.types"
import {
	FISCAL_ASSIGNMENT_STRATEGY,
	FISCAL_SCOPE_PRECEDENCE,
	FISCALITY_CONTRACT_VERSION,
	fiscalDefinitionLifecycleStatus,
	readFiscalJurisdictionCountry,
	type FiscalityAuditAssignment,
} from "./fiscality-contract"

export type FiscalityAuditFindingCode =
	| "active_without_assignment"
	| "duplicate_active_assignment"
	| "missing_jurisdiction"

export type FiscalityAuditFinding = {
	code: FiscalityAuditFindingCode
	severity: "warning"
	message: string
	definitionIds: string[]
	assignmentIds: string[]
}

export type FiscalityConfigurationAudit = {
	contractVersion: typeof FISCALITY_CONTRACT_VERSION
	generatedAt: string
	resolution: {
		scopePrecedence: readonly string[]
		assignmentStrategy: typeof FISCAL_ASSIGNMENT_STRATEGY
	}
	summary: {
		definitions: number
		activeWithoutAssignment: number
		duplicateActiveAssignments: number
		definitionsMissingJurisdiction: number
		lifecycle: Record<string, number>
	}
	findings: FiscalityAuditFinding[]
}

function assignmentKey(assignment: FiscalityAuditAssignment) {
	return [
		assignment.taxFeeDefinitionId,
		assignment.scope,
		assignment.scopeId ?? "__NULL_SCOPE__",
		assignment.channel ?? "__ALL_CHANNELS__",
	].join("|")
}

/** Read-only migration audit. Findings never change definition or assignment state. */
export function auditFiscalityConfiguration(input: {
	definitions: TaxFeeDefinition[]
	assignments: FiscalityAuditAssignment[]
	now?: Date
}): FiscalityConfigurationAudit {
	const now = input.now ?? new Date()
	const assignmentsByDefinition = new Map<string, FiscalityAuditAssignment[]>()
	for (const assignment of input.assignments) {
		const grouped = assignmentsByDefinition.get(assignment.taxFeeDefinitionId) ?? []
		grouped.push(assignment)
		assignmentsByDefinition.set(assignment.taxFeeDefinitionId, grouped)
	}

	const duplicateGroups = new Map<string, FiscalityAuditAssignment[]>()
	for (const assignment of input.assignments.filter((item) => item.status === "active")) {
		const key = assignmentKey(assignment)
		duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), assignment])
	}
	const duplicateDefinitionIds = new Set<string>()
	const findings: FiscalityAuditFinding[] = []
	for (const group of duplicateGroups.values()) {
		if (group.length < 2) continue
		group.forEach((assignment) => duplicateDefinitionIds.add(assignment.taxFeeDefinitionId))
		findings.push({
			code: "duplicate_active_assignment",
			severity: "warning",
			message: `Hay ${group.length} asignaciones activas equivalentes para la misma regla, alcance y canal.`,
			definitionIds: [...new Set(group.map((assignment) => assignment.taxFeeDefinitionId))],
			assignmentIds: group.map((assignment) => assignment.id),
		})
	}

	const lifecycle: Record<string, number> = {}
	let activeWithoutAssignment = 0
	let definitionsMissingJurisdiction = 0
	for (const definition of input.definitions) {
		const assignments = assignmentsByDefinition.get(definition.id) ?? []
		const activeAssignments = assignments.filter((assignment) => assignment.status === "active")
		const status = fiscalDefinitionLifecycleStatus({
			definition,
			assignments,
			hasConflict: duplicateDefinitionIds.has(definition.id),
			now,
		})
		lifecycle[status] = (lifecycle[status] ?? 0) + 1
		// Legacy drafts can retain an old technical status. They are never
		// sellable before publication, so an absent assignment is expected.
		if (
			definition.status === "active" &&
			definition.editingState !== "draft" &&
			activeAssignments.length === 0
		) {
			activeWithoutAssignment += 1
			findings.push({
				code: "active_without_assignment",
				severity: "warning",
				message: `${definition.name} está activa pero no tiene una asignación activa para venta.`,
				definitionIds: [definition.id],
				assignmentIds: assignments.map((assignment) => assignment.id),
			})
		}
		if (!readFiscalJurisdictionCountry(definition.jurisdictionJson)) {
			definitionsMissingJurisdiction += 1
			findings.push({
				code: "missing_jurisdiction",
				severity: "warning",
				message: `${definition.name} no tiene un país de jurisdicción definido. Revísala antes de publicarla en nuevos alcances.`,
				definitionIds: [definition.id],
				assignmentIds: [],
			})
		}
	}

	return {
		contractVersion: FISCALITY_CONTRACT_VERSION,
		generatedAt: now.toISOString(),
		resolution: {
			scopePrecedence: FISCAL_SCOPE_PRECEDENCE,
			assignmentStrategy: FISCAL_ASSIGNMENT_STRATEGY,
		},
		summary: {
			definitions: input.definitions.length,
			activeWithoutAssignment,
			duplicateActiveAssignments: findings.filter(
				(finding) => finding.code === "duplicate_active_assignment"
			).length,
			definitionsMissingJurisdiction,
			lifecycle,
		},
		findings,
	}
}
