import type { SQL } from "drizzle-orm"

import {
	evaluateRequiredKycDocumentsComplete,
	listProviderDocuments,
} from "@/lib/provider-documents"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { listProviderPaymentAccounts } from "@/lib/provider-payment-accounts"
import { getProviderTaxConfiguration } from "@/lib/provider-tax-configuration"

import {
	and,
	asc,
	CaseActivityEvent,
	CaseDecision,
	CaseDecisionApproval,
	CaseSlaTimer,
	CaseTask,
	ComplianceCase,
	ComplianceDecisionReason,
	count,
	db,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	or,
	Provider,
	ProviderVerification,
	SavedCaseView,
	sql,
} from "@/shared/infrastructure/db/compat"

export const ACTIVE_CASE_STATUSES = ["open", "in_review", "waiting_information", "blocked"] as const
export const CASE_DOMAINS = ["verification", "fiscal", "documents", "payments"] as const

// The provider record uses these terms as its single, human-facing vocabulary.
// Keep machine values at the API boundary; the page should only render this copy.
export const PROVIDER_WORK_VOCABULARY = {
	domains: {
		verification: "Identidad y negocio",
		fiscal: "Fiscalidad",
		documents: "Documentos",
		payments: "Pagos",
	},
	statuses: {
		open: "Abierto",
		in_review: "En revisión",
		waiting_information: "Esperando información",
		blocked: "Bloqueado",
		resolved: "Resuelto",
	},
	actions: {
		openCase: "Abrir revisión",
		viewArea: "Ver revisiones",
		viewAllPending: "Ver todos los pendientes",
	},
	results: {
		noActiveCases: "No hay casos activos",
		noClosedCases: "No hay revisiones cerradas todavía",
	},
} as const

export type ProviderOperationalArea = {
	status: "verified" | "in_review" | "attention" | "information_needed" | "reconciliation_needed"
	statusLabel: string
	source: string
	sourceUpdatedAt: Date | null
	reason: string
	missingEvidence: string[]
}

function latestDate(values: Array<Date | null | undefined>) {
	return values.reduce<Date | null>((latest, value) => {
		if (!value || (latest && latest >= value)) return latest
		return value
	}, null)
}

function isStaleTerminalSource(status: string, updatedAt: Date | null) {
	return ["verified", "approved"].includes(status) && !updatedAt
}

/** Read-only contract backed by owned source records, never account status or case counts. */
export async function getProviderOperationalSnapshot(providerId: string) {
	const [verificationRows, tax, documents, paymentAccounts, governance] = await Promise.all([
		db
			.select({
				status: ProviderVerification.status,
				reason: ProviderVerification.reason,
				reviewedAt: ProviderVerification.reviewedAt,
				createdAt: ProviderVerification.createdAt,
			})
			.from(ProviderVerification)
			.where(eq(ProviderVerification.providerId, providerId))
			.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
			.limit(1),
		getProviderTaxConfiguration(providerId),
		listProviderDocuments(providerId),
		listProviderPaymentAccounts(providerId),
		evaluateProviderGovernance(providerId),
	])
	const verification = verificationRows[0] ?? null
	const verificationDate = verification?.reviewedAt ?? verification?.createdAt ?? null
	const fiscalDate = tax?.updatedAt ?? null
	const taxDocument = documents.find((document) => document.type === "tax_document") ?? null
	const documentsDate = latestDate(
		documents.map((document) => document.reviewedAt ?? document.updatedAt)
	)
	const paymentsDate = latestDate(
		paymentAccounts.map((account) => account.verifiedAt ?? account.updatedAt)
	)
	const kyc = evaluateRequiredKycDocumentsComplete(documents, {
		taxDocumentSatisfiedByFiscal: Boolean(
			tax?.businessRegistrationNumber && tax.status === "verified"
		),
	})
	const rejectedDocuments = documents.filter((document) => document.status === "rejected")
	const pendingDocuments = documents.filter((document) => document.status === "pending")
	const verifiedPaymentAccounts = paymentAccounts.filter((account) => account.status === "verified")
	const attentionPaymentAccounts = paymentAccounts.filter(
		(account) => account.status === "requires_attention"
	)
	const pendingPaymentAccounts = paymentAccounts.filter((account) => account.status === "pending")
	const labelDocument = (type: string) =>
		type === "government_id"
			? "Documento de identidad"
			: type === "business_registration"
				? "Registro mercantil"
				: "Documento fiscal"
	const stale = {
		verification: isStaleTerminalSource(String(verification?.status ?? ""), verificationDate),
		fiscal: isStaleTerminalSource(String(tax?.status ?? ""), fiscalDate),
		documents: kyc.complete && !documentsDate,
		payments: verifiedPaymentAccounts.length > 0 && !paymentsDate,
	}
	const taxDocumentConflict = tax?.status === "verified" && taxDocument?.status === "rejected"
	const payoutConflict = governance.risks.some(
		(risk) => risk.id === "financial_profile_without_verified_payout"
	)
	const reconcile = (
		area: ProviderOperationalArea,
		needed: boolean,
		reason: string
	): ProviderOperationalArea =>
		needed
			? { ...area, status: "reconciliation_needed", statusLabel: "Requiere reconciliación", reason }
			: area
	const areas = {
		verification: reconcile(
			verification?.status === "approved"
				? {
						status: "verified",
						statusLabel: "Verificada",
						source: "Revisión de identidad",
						sourceUpdatedAt: verificationDate,
						reason: verification.reason || "La revisión de identidad fue aprobada.",
						missingEvidence: [],
					}
				: verification?.status === "rejected"
					? {
							status: "attention",
							statusLabel: "Corrección solicitada",
							source: "Revisión de identidad",
							sourceUpdatedAt: verificationDate,
							reason: verification.reason || "La revisión de identidad requiere cambios.",
							missingEvidence: ["Corrección indicada por la revisión"],
						}
					: verification
						? {
								status: "in_review",
								statusLabel: "En revisión",
								source: "Revisión de identidad",
								sourceUpdatedAt: verificationDate,
								reason: verification.reason || "La identidad está esperando una decisión.",
								missingEvidence: [],
							}
						: {
								status: "information_needed",
								statusLabel: "Información pendiente",
								source: "Sin revisión de identidad registrada",
								sourceUpdatedAt: null,
								reason: "No hay una evaluación de identidad disponible.",
								missingEvidence: ["Resultado de la revisión de identidad"],
							},
			stale.verification,
			"La revisión de identidad no tiene fecha verificable; confirma su vigencia."
		),
		fiscal: reconcile(
			tax?.status === "verified"
				? {
						status: "verified",
						statusLabel: "Verificada",
						source: "Registro fiscal",
						sourceUpdatedAt: fiscalDate,
						reason: "El NIT/TIN y la configuración fiscal fueron verificados.",
						missingEvidence: [],
					}
				: tax?.status === "requires_attention"
					? {
							status: "attention",
							statusLabel: "Corrección solicitada",
							source: "Registro fiscal",
							sourceUpdatedAt: fiscalDate,
							reason: "La revisión fiscal indicó que requiere corrección.",
							missingEvidence: ["Corrección de identidad fiscal"],
						}
					: tax?.status === "pending"
						? {
								status: "in_review",
								statusLabel: "En revisión",
								source: "Registro fiscal",
								sourceUpdatedAt: fiscalDate,
								reason: "La identidad fiscal fue enviada y espera revisión.",
								missingEvidence: [],
							}
						: {
								status: "information_needed",
								statusLabel: "Información pendiente",
								source: "Sin registro fiscal configurado",
								sourceUpdatedAt: null,
								reason: "No hay una identidad fiscal verificable.",
								missingEvidence: ["NIT/TIN o registro fiscal"],
							},
			stale.fiscal || taxDocumentConflict,
			taxDocumentConflict
				? "El documento fiscal fue rechazado mientras el registro fiscal figura verificado; confirma cuál evidencia prevalece."
				: "La evaluación fiscal no tiene fecha verificable; confirma su vigencia."
		),
		documents: reconcile(
			kyc.complete
				? {
						status: "verified",
						statusLabel: "Verificados",
						source: "Documentos de cumplimiento",
						sourceUpdatedAt: documentsDate,
						reason:
							"Los documentos mínimos están verificados; el documento fiscal se cubre por el NIT/TIN verificado cuando corresponde.",
						missingEvidence: [],
					}
				: rejectedDocuments.length
					? {
							status: "attention",
							statusLabel: "Documentos rechazados",
							source: "Documentos de cumplimiento",
							sourceUpdatedAt: documentsDate,
							reason: "Hay documentos rechazados que requieren corrección.",
							missingEvidence: rejectedDocuments.map((document) => document.typeLabel),
						}
					: pendingDocuments.length
						? {
								status: "in_review",
								statusLabel: "En revisión",
								source: "Documentos de cumplimiento",
								sourceUpdatedAt: documentsDate,
								reason: "Hay documentos enviados esperando una decisión.",
								missingEvidence: kyc.missingRequiredTypes
									.filter(
										(type) =>
											!documents.some(
												(document) => document.type === type && document.status === "pending"
											)
									)
									.map(labelDocument),
							}
						: {
								status: "information_needed",
								statusLabel: "Información pendiente",
								source: "Documentos de cumplimiento",
								sourceUpdatedAt: documentsDate,
								reason: "Faltan documentos mínimos verificables.",
								missingEvidence: kyc.missingRequiredTypes.map(labelDocument),
							},
			stale.documents,
			"La evidencia documental no tiene fecha verificable; confirma su vigencia."
		),
		payments: reconcile(
			verifiedPaymentAccounts.length
				? {
						status: "verified",
						statusLabel: "Cuenta validada",
						source: "Cuenta para desembolsos",
						sourceUpdatedAt: paymentsDate,
						reason: "Existe una cuenta verificada para la titularidad registrada.",
						missingEvidence: [],
					}
				: attentionPaymentAccounts.length
					? {
							status: "attention",
							statusLabel: "Corrección solicitada",
							source: "Cuenta para desembolsos",
							sourceUpdatedAt: paymentsDate,
							reason: "La validación de la cuenta requiere corrección.",
							missingEvidence: ["Corrección de la cuenta o titularidad"],
						}
					: pendingPaymentAccounts.length
						? {
								status: "in_review",
								statusLabel: "Validación en curso",
								source: "Cuenta para desembolsos",
								sourceUpdatedAt: paymentsDate,
								reason: "Hay una cuenta enviada esperando validación.",
								missingEvidence: [],
							}
						: {
								status: "information_needed",
								statusLabel: "Información pendiente",
								source: "Sin cuenta para desembolsos registrada",
								sourceUpdatedAt: null,
								reason: "No hay una cuenta que pueda validarse para desembolsos.",
								missingEvidence: ["Cuenta y titularidad para desembolsos"],
							},
			stale.payments || payoutConflict,
			payoutConflict
				? "El perfil de cobros contradice la ausencia de una cuenta verificada; reconcilia las fuentes."
				: "La validación de cuenta no tiene fecha verificable; confirma su vigencia."
		),
	}
	const capabilityReason = (capability: "publish" | "booking" | "payments") => {
		const blockers = governance.blockers.filter((blocker) =>
			blocker.capabilities.includes(capability)
		)
		return blockers.length
			? "Requisitos pendientes: " + blockers.map((blocker) => blocker.label).join(" · ")
			: "Los requisitos evaluados están completos."
	}
	return {
		evaluatedAt: new Date(),
		areas,
		capabilities: {
			collections: {
				available: governance.capabilities.payments,
				source: "Evaluación de gobernanza",
				reason: capabilityReason("payments"),
			},
			payoutAccount: {
				available: verifiedPaymentAccounts.length > 0,
				source: areas.payments.source,
				reason: areas.payments.reason,
				evaluatedAt: areas.payments.sourceUpdatedAt,
			},
			disbursements: {
				available: null,
				source: "Sin fuente de ejecución de desembolsos",
				reason: "La validación de cuenta no confirma que un desembolso concreto esté disponible.",
				evaluatedAt: null,
			},
		},
	}
}

export const COMMAND_CENTER_QUEUES = {
	"all": {
		label: "Todas las pendientes",
		description: "Expedientes activos de los cuatro dominios.",
	},
	"overdue": {
		label: "SLA vencido",
		description: "Trabajo fuera del objetivo interno.",
		sla: "overdue",
	},
	"due-soon": {
		label: "Por vencer",
		description: "SLA dentro de las próximas ocho horas.",
		sla: "due_soon",
	},
	"high-risk": {
		label: "Riesgo alto",
		description: "Expedientes que requieren revisión reforzada.",
		riskTier: "high",
	},
	"unassigned": {
		label: "Sin asignar",
		description: "Trabajo listo para ser tomado.",
		unassigned: true,
	},
	"verification": {
		label: "Identidad y negocio",
		description: "KYC/KYB del proveedor.",
		domain: "verification",
	},
	"fiscal": {
		label: "Fiscalidad",
		description: "Identidad y configuración fiscal.",
		domain: "fiscal",
	},
	"documents": {
		label: "Documentos",
		description: "Evidencia, licencias y vigencias.",
		domain: "documents",
	},
	"payments": {
		label: "Pagos",
		description: "Cuenta de payout y titularidad.",
		domain: "payments",
	},
} as const

const normalizeFilter = (value: string | null, maxLength = 160) => {
	const normalized = String(value ?? "").trim()
	return normalized ? normalized.slice(0, maxLength) : null
}

export function parseCommandCenterQueueFilters(queueId: string, searchParams: URLSearchParams) {
	const resolvedQueueId = queueId in COMMAND_CENTER_QUEUES ? queueId : "all"
	const queue = COMMAND_CENTER_QUEUES[resolvedQueueId as keyof typeof COMMAND_CENTER_QUEUES]
	const requestedDomain = normalizeFilter(searchParams.get("domain"), 32)
	const domain =
		"domain" in queue
			? queue.domain
			: requestedDomain && CASE_DOMAINS.includes(requestedDomain as (typeof CASE_DOMAINS)[number])
				? requestedDomain
				: null
	return {
		queueId: resolvedQueueId,
		queue,
		filters: {
			domain,
			priority: normalizeFilter(searchParams.get("priority"), 32),
			riskTier:
				"riskTier" in queue ? queue.riskTier : normalizeFilter(searchParams.get("riskTier"), 32),
			status: normalizeFilter(searchParams.get("status"), 32),
			providerId: normalizeFilter(searchParams.get("providerId")),
			sla: "sla" in queue ? queue.sla : null,
			unassigned: "unassigned" in queue ? queue.unassigned : false,
			cursor: normalizeFilter(searchParams.get("cursor"), 1_000),
		},
	}
}

export function summarizeProviderCaseCounts(
	items: Array<{ domain: string; status: string; total: number | string }>
) {
	const activeByDomain = Object.fromEntries(CASE_DOMAINS.map((domain) => [domain, 0])) as Record<
		(typeof CASE_DOMAINS)[number],
		number
	>
	let total = 0
	for (const item of items) {
		const amount = Number(item.total)
		total += amount
		if (
			ACTIVE_CASE_STATUSES.includes(item.status as (typeof ACTIVE_CASE_STATUSES)[number]) &&
			CASE_DOMAINS.includes(item.domain as (typeof CASE_DOMAINS)[number])
		)
			activeByDomain[item.domain as (typeof CASE_DOMAINS)[number]] += amount
	}
	return { total, activeByDomain }
}

type ProviderPendingCase = {
	slaStatus: string
	priority: string
	status: string
	slaDueAt: Date | null
	openedAt: Date
}

/**
 * Makes the reason for the first recommended review predictable: SLA first,
 * then priority, then cases that can be acted on immediately.
 */
export function prioritizeProviderPendingCases<T extends ProviderPendingCase>(items: T[]) {
	const slaRank: Record<string, number> = {
		overdue: 0,
		due_soon: 1,
		running: 2,
		paused: 3,
		none: 4,
	}
	const priorityRank: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }
	const statusRank: Record<string, number> = {
		blocked: 0,
		in_review: 1,
		open: 2,
		waiting_information: 3,
	}
	return [...items].sort((left, right) => {
		const bySla = (slaRank[left.slaStatus] ?? 5) - (slaRank[right.slaStatus] ?? 5)
		if (bySla) return bySla
		const byPriority = (priorityRank[left.priority] ?? 4) - (priorityRank[right.priority] ?? 4)
		if (byPriority) return byPriority
		const byStatus = (statusRank[left.status] ?? 4) - (statusRank[right.status] ?? 4)
		if (byStatus) return byStatus
		const byDueDate =
			(left.slaDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
			(right.slaDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
		if (byDueDate) return byDueDate
		return left.openedAt.getTime() - right.openedAt.getTime()
	})
}

export type CaseListFilters = {
	providerId?: string | null
	domain?: string | null
	status?: string | null
	priority?: string | null
	riskTier?: string | null
	assigneeUserId?: string | null
	assigneeEmail?: string | null
	sla?: "overdue" | "due_soon" | null
	search?: string | null
	unassigned?: boolean
	pendingSecondControlForUserId?: string | null
	cursor?: string | null
	limit?: number
}

type Cursor = { openedAt: string; id: string }

function encodeCursor(value: Cursor) {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
	if (!raw) return null
	try {
		const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor
		if (!value.id || !Number.isFinite(new Date(value.openedAt).getTime())) return null
		return value
	} catch {
		return null
	}
}

function normalizedLimit(value: number | undefined) {
	return Math.min(Math.max(Number(value ?? 40) || 40, 1), 100)
}

function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export async function listCommandCenterCases(filters: CaseListFilters = {}) {
	const limit = normalizedLimit(filters.limit)
	const cursor = decodeCursor(filters.cursor)
	const conditions: SQL[] = []

	if (filters.status) conditions.push(eq(ComplianceCase.status, filters.status))
	else conditions.push(inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES]))
	if (filters.providerId) conditions.push(eq(ComplianceCase.providerId, filters.providerId.trim()))
	if (filters.domain && CASE_DOMAINS.includes(filters.domain as (typeof CASE_DOMAINS)[number]))
		conditions.push(eq(ComplianceCase.domain, filters.domain))
	if (filters.priority) conditions.push(eq(ComplianceCase.priority, filters.priority))
	if (filters.riskTier) conditions.push(eq(ComplianceCase.riskTier, filters.riskTier))
	if (filters.unassigned) {
		conditions.push(sql`NOT EXISTS (
			SELECT 1 FROM "CaseTask" task
			WHERE task."caseId" = ${ComplianceCase.id}
			  AND task."status" IN ('open', 'in_progress', 'blocked')
			  AND (task."assigneeUserId" IS NOT NULL OR task."assigneeEmail" IS NOT NULL)
		)`)
	}
	if (filters.pendingSecondControlForUserId) {
		conditions.push(sql`EXISTS (
			SELECT 1 FROM "CaseDecision" decision
			WHERE decision."caseId" = ${ComplianceCase.id}
			  AND decision."status" = 'pending_approval'
			  AND decision."proposedByUserId" <> ${filters.pendingSecondControlForUserId}
		)`)
	}
	if (filters.assigneeUserId || filters.assigneeEmail) {
		const assigned = await db
			.select({ caseId: CaseTask.caseId })
			.from(CaseTask)
			.where(
				and(
					inArray(CaseTask.status, ["open", "in_progress", "blocked"]),
					filters.assigneeUserId
						? eq(CaseTask.assigneeUserId, filters.assigneeUserId)
						: eq(CaseTask.assigneeEmail, filters.assigneeEmail!)
				)
			)
		const assignedIds = [...new Set(assigned.map((row) => row.caseId))]
		if (!assignedIds.length) return { items: [], nextCursor: null, limit }
		conditions.push(inArray(ComplianceCase.id, assignedIds))
	}
	if (filters.sla) {
		const now = new Date()
		const dueSoon = new Date(now.getTime() + 8 * 60 * 60 * 1000)
		const eligible = await db
			.select({ caseId: CaseSlaTimer.caseId })
			.from(CaseSlaTimer)
			.where(
				filters.sla === "overdue"
					? or(
							eq(CaseSlaTimer.status, "breached"),
							and(eq(CaseSlaTimer.status, "running"), lt(CaseSlaTimer.dueAt, now))
						)!
					: and(
							eq(CaseSlaTimer.status, "running"),
							// due soon but not already overdue
							sql`${CaseSlaTimer.dueAt} >= ${now}`,
							sql`${CaseSlaTimer.dueAt} <= ${dueSoon}`
						)!
			)
		const eligibleIds = [...new Set(eligible.map((row) => row.caseId))]
		if (!eligibleIds.length) return { items: [], nextCursor: null, limit }
		conditions.push(inArray(ComplianceCase.id, eligibleIds))
	}
	if (filters.search) {
		const pattern = `%${escapeLike(filters.search.trim().toLowerCase().slice(0, 100))}%`
		conditions.push(
			or(
				eq(ComplianceCase.id, filters.search.trim()),
				eq(ComplianceCase.caseNumber, filters.search.trim().toUpperCase()),
				eq(ComplianceCase.providerId, filters.search.trim()),
				sql`lower(coalesce(${Provider.displayName}, '')) LIKE ${pattern} ESCAPE '\\'`,
				sql`lower(coalesce(${Provider.legalName}, '')) LIKE ${pattern} ESCAPE '\\'`,
				sql`lower(${ComplianceCase.sourceRef}) LIKE ${pattern} ESCAPE '\\'`
			)!
		)
	}
	if (cursor) {
		const openedAt = new Date(cursor.openedAt)
		conditions.push(
			or(
				lt(ComplianceCase.openedAt, openedAt),
				and(eq(ComplianceCase.openedAt, openedAt), lt(ComplianceCase.id, cursor.id))
			)!
		)
	}

	// Search by human-readable provider fields without exposing raw sensitive sources.
	let rows = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			summary: ComplianceCase.summary,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(and(...conditions))
		.orderBy(desc(ComplianceCase.openedAt), desc(ComplianceCase.id))
		.limit(limit + 1)

	const pageRows = rows.slice(0, limit)
	const caseIds = pageRows.map((row) => row.id)
	const [tasks, timers] = caseIds.length
		? await Promise.all([
				db
					.select({
						caseId: CaseTask.caseId,
						status: CaseTask.status,
						assigneeEmail: CaseTask.assigneeEmail,
						assigneeUserId: CaseTask.assigneeUserId,
					})
					.from(CaseTask)
					.where(inArray(CaseTask.caseId, caseIds)),
				db
					.select({
						caseId: CaseSlaTimer.caseId,
						status: CaseSlaTimer.status,
						dueAt: CaseSlaTimer.dueAt,
					})
					.from(CaseSlaTimer)
					.where(inArray(CaseSlaTimer.caseId, caseIds)),
			])
		: [[], []]
	const now = Date.now()
	const dueSoonAt = now + 8 * 60 * 60 * 1000
	const enriched = pageRows.map((row) => {
		const caseTasks = tasks.filter((task) => task.caseId === row.id)
		const timer = timers.find((candidate) => candidate.caseId === row.id) ?? null
		return {
			...row,
			assigneeEmail: caseTasks.find((task) => task.assigneeEmail)?.assigneeEmail ?? null,
			assigneeUserId: caseTasks.find((task) => task.assigneeUserId)?.assigneeUserId ?? null,
			openTasks: caseTasks.filter((task) =>
				["open", "in_progress", "blocked"].includes(task.status)
			).length,
			slaStatus:
				timer?.status === "breached" || (timer?.status === "running" && timer.dueAt.getTime() < now)
					? "overdue"
					: timer?.status === "running" && timer.dueAt.getTime() <= dueSoonAt
						? "due_soon"
						: (timer?.status ?? "none"),
			slaDueAt: timer?.dueAt ?? null,
		}
	})
	const last = pageRows.at(-1)
	return {
		items: enriched,
		nextCursor:
			rows.length > limit && last
				? encodeCursor({ openedAt: last.openedAt.toISOString(), id: last.id })
				: null,
		limit,
	}
}

export async function getCommandCenterSummary() {
	const cases = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			summary: ComplianceCase.summary,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES]))
		.orderBy(desc(ComplianceCase.openedAt), desc(ComplianceCase.id))
		.limit(2_000)
	const caseIds = cases.map((item) => item.id)
	const [tasks, timers] = caseIds.length
		? await Promise.all([
				db
					.select({
						caseId: CaseTask.caseId,
						assigneeEmail: CaseTask.assigneeEmail,
						assigneeUserId: CaseTask.assigneeUserId,
					})
					.from(CaseTask)
					.where(
						and(
							inArray(CaseTask.caseId, caseIds),
							inArray(CaseTask.status, ["open", "in_progress", "blocked"])
						)
					),
				db
					.select({
						caseId: CaseSlaTimer.caseId,
						status: CaseSlaTimer.status,
						dueAt: CaseSlaTimer.dueAt,
					})
					.from(CaseSlaTimer)
					.where(inArray(CaseSlaTimer.caseId, caseIds)),
			])
		: [[], []]
	const now = Date.now()
	const dueSoonAt = now + 8 * 60 * 60 * 1000
	const items = cases.map((item) => {
		const caseTasks = tasks.filter((task) => task.caseId === item.id)
		const timer = timers.find((candidate) => candidate.caseId === item.id) ?? null
		return {
			...item,
			assigneeEmail: caseTasks.find((task) => task.assigneeEmail)?.assigneeEmail ?? null,
			assigneeUserId: caseTasks.find((task) => task.assigneeUserId)?.assigneeUserId ?? null,
			openTasks: caseTasks.length,
			slaStatus:
				timer?.status === "breached" || (timer?.status === "running" && timer.dueAt.getTime() < now)
					? "overdue"
					: timer?.status === "running" && timer.dueAt.getTime() <= dueSoonAt
						? "due_soon"
						: (timer?.status ?? "none"),
			slaDueAt: timer?.dueAt ?? null,
		}
	})
	const byDomain = Object.fromEntries(CASE_DOMAINS.map((domain) => [domain, 0])) as Record<
		(typeof CASE_DOMAINS)[number],
		number
	>
	for (const item of items) byDomain[item.domain as keyof typeof byDomain] += 1
	return {
		open: items.length,
		overdue: items.filter((item) => item.slaStatus === "overdue").length,
		dueSoon: items.filter((item) => item.slaStatus === "due_soon").length,
		highRisk: items.filter((item) => item.riskTier === "high").length,
		critical: items.filter((item) => item.priority === "critical").length,
		unassigned: items.filter((item) => !item.assigneeUserId && !item.assigneeEmail).length,
		byDomain,
		recent: items.slice(0, 8),
		scope: { country: "BO", vertical: "accommodation", collectionModel: "intermediary" },
	}
}

export async function getCaseWorkspace(caseId: string) {
	const rows = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			summary: ComplianceCase.summary,
			resolutionCode: ComplianceCase.resolutionCode,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(eq(ComplianceCase.id, caseId))
		.limit(1)
	const item = rows[0]
	if (!item) return null
	const [tasks, timers, activities, decisions, approvals, reasons] = await Promise.all([
		db.select().from(CaseTask).where(eq(CaseTask.caseId, caseId)).orderBy(asc(CaseTask.createdAt)),
		db.select().from(CaseSlaTimer).where(eq(CaseSlaTimer.caseId, caseId)),
		db
			.select()
			.from(CaseActivityEvent)
			.where(eq(CaseActivityEvent.caseId, caseId))
			.orderBy(desc(CaseActivityEvent.createdAt))
			.limit(100),
		db
			.select()
			.from(CaseDecision)
			.where(eq(CaseDecision.caseId, caseId))
			.orderBy(desc(CaseDecision.createdAt)),
		db
			.select({
				decisionId: CaseDecisionApproval.decisionId,
				actorUserId: CaseDecisionApproval.actorUserId,
				vote: CaseDecisionApproval.vote,
				reason: CaseDecisionApproval.reason,
				createdAt: CaseDecisionApproval.createdAt,
			})
			.from(CaseDecisionApproval)
			.innerJoin(CaseDecision, eq(CaseDecisionApproval.decisionId, CaseDecision.id))
			.where(eq(CaseDecision.caseId, caseId))
			.orderBy(desc(CaseDecisionApproval.createdAt)),
		item.policyVersionId
			? db
					.select()
					.from(ComplianceDecisionReason)
					.where(
						and(
							eq(ComplianceDecisionReason.policyVersionId, item.policyVersionId),
							eq(ComplianceDecisionReason.active, true),
							or(
								isNull(ComplianceDecisionReason.domain),
								eq(ComplianceDecisionReason.domain, item.domain)
							)
						)
					)
			: Promise.resolve([]),
	])
	return { case: item, tasks, timers, activities, decisions, approvals, reasons }
}

export async function getProvider360(providerId: string) {
	const providers = await db.select().from(Provider).where(eq(Provider.id, providerId)).limit(1)
	if (!providers[0]) return null
	const [cases, caseCounts, pending, operational] = await Promise.all([
		db
			.select()
			.from(ComplianceCase)
			.where(eq(ComplianceCase.providerId, providerId))
			.orderBy(desc(ComplianceCase.openedAt))
			.limit(100),
		db
			.select({ domain: ComplianceCase.domain, status: ComplianceCase.status, total: count() })
			.from(ComplianceCase)
			.where(eq(ComplianceCase.providerId, providerId))
			.groupBy(ComplianceCase.domain, ComplianceCase.status),
		listCommandCenterCases({ providerId, limit: 100 }),
		getProviderOperationalSnapshot(providerId),
	])
	return {
		provider: providers[0],
		cases,
		caseCounts: summarizeProviderCaseCounts(caseCounts),
		pendingCases: prioritizeProviderPendingCases(pending.items),
		operational,
	}
}

export async function getDecisionAuthorizationContext(decisionId: string) {
	const rows = await db
		.select({
			caseId: ComplianceCase.id,
			providerId: ComplianceCase.providerId,
			domain: ComplianceCase.domain,
			proposedByUserId: CaseDecision.proposedByUserId,
		})
		.from(CaseDecision)
		.innerJoin(ComplianceCase, eq(CaseDecision.caseId, ComplianceCase.id))
		.where(eq(CaseDecision.id, decisionId))
		.limit(1)
	return rows[0] ?? null
}

export async function listSavedCaseViews(ownerUserId: string) {
	return db
		.select()
		.from(SavedCaseView)
		.where(or(eq(SavedCaseView.ownerUserId, ownerUserId), eq(SavedCaseView.scope, "team")))
		.orderBy(desc(SavedCaseView.isDefault), asc(SavedCaseView.name))
}
