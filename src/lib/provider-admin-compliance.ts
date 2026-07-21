import { db, desc, eq, Provider, ProviderAuditLog, ProviderVerification, User } from "astro:db"

import { listOpenComplianceAssignments } from "@/lib/provider-compliance-ops"
import { listPendingProviderDocumentsForAdmin } from "@/lib/provider-documents"
import { listPendingProviderPaymentAccountsForAdmin } from "@/lib/provider-payment-accounts"
import { listProviderTaxConfigurationsForAdmin } from "@/lib/provider-tax-configuration"

/**
 * Unified internal compliance console (Airbnb Trust & Safety / Expedia partner ops).
 *
 * Host/partner submits identity, tax, documents and payout methods.
 * Platform ops work from one queue surface with dimensional filters and a
 * shared audit trail — never from provider self-certification.
 *
 * Queues:
 * - verification  → ProviderVerification (latest pending)
 * - fiscal        → ProviderTaxConfiguration pending | requires_attention
 * - documents     → ProviderDocument pending
 * - payments      → ProviderPaymentAccount pending
 * - audit         → recent ProviderAuditLog for compliance domains
 */

export type ProviderComplianceQueueFilter =
	| "all"
	| "verification"
	| "fiscal"
	| "documents"
	| "payments"
	| "audit"

export type ProviderComplianceQueueCounts = {
	verification: number
	fiscal: number
	documents: number
	payments: number
	total: number
}

export type ProviderComplianceVerificationRow = {
	providerId: string
	displayName: string
	legalName: string
	providerStatus: string
	verificationStatus: "pending" | "approved" | "rejected"
	verificationReason: string | null
	verificationUpdatedAt: Date | null
}

export type ProviderComplianceAuditRow = {
	id: string
	providerId: string
	providerDisplayName: string
	actorUserId: string | null
	actorEmail: string | null
	action: string
	actionLabel: string
	entityType: string
	entityId: string | null
	riskLevel: string
	beforeJson: unknown
	afterJson: unknown
	createdAt: Date | null
	domain: "verification" | "fiscal" | "documents" | "payments" | "other"
}

const COMPLIANCE_ACTION_PREFIXES = [
	"provider.verification.",
	"provider.tax_configuration.",
	"provider.document.",
	"provider.payment_account.",
] as const

const ACTION_LABELS: Record<string, string> = {
	"provider.verification.review": "Revisión de verificación",
	"provider.tax_configuration.upsert": "Envío fiscal",
	"provider.tax_configuration.review": "Revisión fiscal",
	"provider.document.submit": "Envío de documento",
	"provider.document.review": "Revisión de documento",
	"provider.payment_account.create": "Envío de cuenta de payout",
	"provider.payment_account.review": "Revisión de cuenta de payout",
	"provider.payment_account.micro_deposit_initiate": "Micro-depósito iniciado",
	"provider.payment_account.micro_deposit_confirm": "Micro-depósito confirmado",
}

export function parseProviderComplianceQueueFilter(
	raw: string | null | undefined
): ProviderComplianceQueueFilter {
	const value = String(raw ?? "all").trim()
	// Legacy alias from early admin UI.
	if (value === "pending") return "verification"
	if (
		value === "all" ||
		value === "verification" ||
		value === "fiscal" ||
		value === "documents" ||
		value === "payments" ||
		value === "audit"
	) {
		return value
	}
	return "all"
}

function domainForAction(action: string): ProviderComplianceAuditRow["domain"] {
	if (action.startsWith("provider.verification.")) return "verification"
	if (action.startsWith("provider.tax_configuration.")) return "fiscal"
	if (action.startsWith("provider.document.")) return "documents"
	if (action.startsWith("provider.payment_account.")) return "payments"
	return "other"
}

function isComplianceAuditAction(action: string): boolean {
	return COMPLIANCE_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
}

export async function listPendingProviderVerificationsForAdmin(): Promise<
	ProviderComplianceVerificationRow[]
> {
	const providers = await db
		.select({
			id: Provider.id,
			displayName: Provider.displayName,
			legalName: Provider.legalName,
			status: Provider.status,
		})
		.from(Provider)
		.orderBy(desc(Provider.createdAt), desc(Provider.id))
		.all()
		.catch(() => [])

	const verificationRows = await db
		.select({
			providerId: ProviderVerification.providerId,
			status: ProviderVerification.status,
			reason: ProviderVerification.reason,
			createdAt: ProviderVerification.createdAt,
		})
		.from(ProviderVerification)
		.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
		.all()
		.catch(() => [])

	const latestByProvider = new Map<string, (typeof verificationRows)[number]>()
	for (const row of verificationRows) {
		if (!latestByProvider.has(row.providerId)) {
			latestByProvider.set(row.providerId, row)
		}
	}

	return providers
		.map((provider) => {
			const latest = latestByProvider.get(provider.id)
			const verificationStatus = (latest?.status ?? "pending") as
				| "pending"
				| "approved"
				| "rejected"
			return {
				providerId: provider.id,
				displayName: provider.displayName ?? "Sin nombre",
				legalName: provider.legalName ?? "Sin razón social",
				providerStatus: provider.status ?? "draft",
				verificationStatus,
				verificationReason: latest?.reason ?? null,
				verificationUpdatedAt: latest?.createdAt ?? null,
			}
		})
		.filter((row) => row.verificationStatus === "pending")
}

export async function listRecentProviderComplianceAudit(params?: {
	limit?: number
}): Promise<ProviderComplianceAuditRow[]> {
	const limit = Math.min(Math.max(params?.limit ?? 40, 1), 200)

	const rows = await db
		.select({
			id: ProviderAuditLog.id,
			providerId: ProviderAuditLog.providerId,
			actorUserId: ProviderAuditLog.actorUserId,
			action: ProviderAuditLog.action,
			entityType: ProviderAuditLog.entityType,
			entityId: ProviderAuditLog.entityId,
			beforeJson: ProviderAuditLog.beforeJson,
			afterJson: ProviderAuditLog.afterJson,
			riskLevel: ProviderAuditLog.riskLevel,
			createdAt: ProviderAuditLog.createdAt,
		})
		.from(ProviderAuditLog)
		.orderBy(desc(ProviderAuditLog.createdAt), desc(ProviderAuditLog.id))
		.all()
		.catch(() => [])

	const complianceRows = rows
		.filter((row) => isComplianceAuditAction(String(row.action)))
		.slice(0, limit)
	if (complianceRows.length === 0) return []

	const actorIds = [
		...new Set(
			complianceRows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id))
		),
	]

	const providers = await db
		.select({ id: Provider.id, displayName: Provider.displayName })
		.from(Provider)
		.all()
		.catch(() => [])
	const providerNameById = new Map(providers.map((row) => [row.id, row.displayName ?? row.id]))

	const actors =
		actorIds.length > 0
			? await db
					.select({ id: User.id, email: User.email })
					.from(User)
					.all()
					.catch(() => [])
			: []
	const actorEmailById = new Map(actors.map((row) => [row.id, row.email ?? null]))

	return complianceRows.map((row) => {
		const action = String(row.action)
		return {
			id: row.id,
			providerId: row.providerId,
			providerDisplayName: providerNameById.get(row.providerId) ?? row.providerId,
			actorUserId: row.actorUserId ?? null,
			actorEmail: row.actorUserId ? (actorEmailById.get(row.actorUserId) ?? null) : null,
			action,
			actionLabel: ACTION_LABELS[action] ?? action,
			entityType: String(row.entityType),
			entityId: row.entityId ?? null,
			riskLevel: String(row.riskLevel ?? "low"),
			beforeJson: row.beforeJson ?? null,
			afterJson: row.afterJson ?? null,
			createdAt: row.createdAt ?? null,
			domain: domainForAction(action),
		}
	})
}

export async function loadProviderComplianceConsole(params?: {
	filter?: ProviderComplianceQueueFilter
	auditLimit?: number
}) {
	const filter = params?.filter ?? "all"
	const showVerification = filter === "all" || filter === "verification"
	const showFiscal = filter === "all" || filter === "fiscal"
	const showDocuments = filter === "all" || filter === "documents"
	const showPayments = filter === "all" || filter === "payments"
	const showAudit = filter === "all" || filter === "audit"

	const [verificationQueue, taxConfigs, documents, payments, audit, assignments] =
		await Promise.all([
			listPendingProviderVerificationsForAdmin(),
			listProviderTaxConfigurationsForAdmin(),
			listPendingProviderDocumentsForAdmin(),
			listPendingProviderPaymentAccountsForAdmin(),
			showAudit
				? listRecentProviderComplianceAudit({ limit: params?.auditLimit ?? 40 })
				: Promise.resolve([] as ProviderComplianceAuditRow[]),
			listOpenComplianceAssignments(),
		])

	const fiscalQueue = taxConfigs.filter(
		(row) => row.status === "pending" || row.status === "requires_attention"
	)

	const providers = await db
		.select({ id: Provider.id, displayName: Provider.displayName })
		.from(Provider)
		.all()
		.catch(() => [])
	const providerNameById = new Map(
		providers.map((row) => [row.id, row.displayName ?? "Sin nombre"])
	)

	const assignmentByKey = new Map(
		assignments.map((row) => [`${row.domain}:${row.providerId}:${row.entityId}`, row])
	)

	const counts: ProviderComplianceQueueCounts = {
		verification: verificationQueue.length,
		fiscal: fiscalQueue.length,
		documents: documents.length,
		payments: payments.length,
		total: verificationQueue.length + fiscalQueue.length + documents.length + payments.length,
	}

	return {
		filter,
		counts,
		assignments,
		verification: showVerification
			? verificationQueue.map((row) => ({
					...row,
					assignment:
						assignmentByKey.get(`verification:${row.providerId}:${row.providerId}`) ?? null,
				}))
			: [],
		fiscal: showFiscal
			? fiscalQueue.map((row) => ({
					...row,
					displayName: providerNameById.get(row.providerId) ?? row.providerId,
					assignment: assignmentByKey.get(`fiscal:${row.providerId}:${row.providerId}`) ?? null,
				}))
			: [],
		documents: showDocuments
			? documents.map((doc) => ({
					...doc,
					displayName: providerNameById.get(doc.providerId) ?? doc.providerId,
					assignment: assignmentByKey.get(`documents:${doc.providerId}:${doc.id}`) ?? null,
				}))
			: [],
		payments: showPayments
			? payments.map((account) => ({
					...account,
					displayName: providerNameById.get(account.providerId) ?? account.providerId,
					assignment: assignmentByKey.get(`payments:${account.providerId}:${account.id}`) ?? null,
				}))
			: [],
		audit: showAudit ? audit : [],
		sections: {
			verification: showVerification,
			fiscal: showFiscal,
			documents: showDocuments,
			payments: showPayments,
			audit: showAudit,
		},
	}
}

export async function getLatestProviderVerificationStatus(providerId: string): Promise<{
	status: "pending" | "approved" | "rejected"
	reason: string | null
} | null> {
	const row = await db
		.select({
			status: ProviderVerification.status,
			reason: ProviderVerification.reason,
		})
		.from(ProviderVerification)
		.where(eq(ProviderVerification.providerId, providerId))
		.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
		.get()
		.catch(() => null)

	if (!row) return null
	const status = String(row.status)
	if (status !== "pending" && status !== "approved" && status !== "rejected") {
		return { status: "pending", reason: row.reason ?? null }
	}
	return { status, reason: row.reason ?? null }
}

export const adminComplianceRejectTemplates = [
	{
		id: "doc_illegible",
		domain: "documents" as const,
		label: "Documento ilegible / incompleto",
		body: "El archivo no permite validar la identidad o el registro. Sube una copia nítida y completa.",
	},
	{
		id: "doc_mismatch",
		domain: "documents" as const,
		label: "Datos no coinciden con el perfil",
		body: "El documento no coincide con la razón social o identidad declarada en el perfil del proveedor.",
	},
	{
		id: "tax_incomplete",
		domain: "fiscal" as const,
		label: "Identidad fiscal incompleta",
		body: "Faltan país de residencia fiscal y/o número de registro válidos para completar la validación.",
	},
	{
		id: "tax_mismatch",
		domain: "fiscal" as const,
		label: "Registro fiscal no verificable",
		body: "No pudimos validar el número de registro fiscal con los datos enviados. Corrige e intenta de nuevo.",
	},
	{
		id: "payout_invalid",
		domain: "payments" as const,
		label: "Datos bancarios inválidos",
		body: "La cuenta o el SWIFT/IBAN no es válido o no coincide con el titular. Envía una cuenta corregida.",
	},
	{
		id: "verification_policy",
		domain: "verification" as const,
		label: "No cumple política de cumplimiento",
		body: "La cuenta no cumple los requisitos de cumplimiento de Fastt en este momento. Revisa la documentación pendiente.",
	},
] as const

export async function loadProviderComplianceDetail(providerId: string) {
	const id = String(providerId ?? "").trim()
	if (!id) return null

	const provider = await db
		.select({
			id: Provider.id,
			displayName: Provider.displayName,
			legalName: Provider.legalName,
			status: Provider.status,
		})
		.from(Provider)
		.where(eq(Provider.id, id))
		.get()
		.catch(() => null)
	if (!provider?.id) return null

	const consolePayload = await loadProviderComplianceConsole({ filter: "all", auditLimit: 20 })
	const verification = consolePayload.verification.find((row) => row.providerId === id) ?? null
	const latestVerification = await getLatestProviderVerificationStatus(id)
	const fiscal = consolePayload.fiscal.filter((row) => row.providerId === id)
	const documents = consolePayload.documents.filter((row) => row.providerId === id)
	const payments = consolePayload.payments.filter((row) => row.providerId === id)
	const audit = consolePayload.audit.filter((row) => row.providerId === id)

	return {
		provider: {
			id: provider.id,
			displayName: provider.displayName ?? "Sin nombre",
			legalName: provider.legalName ?? "Sin razón social",
			status: provider.status ?? "draft",
		},
		latestVerification,
		pending: {
			verification: Boolean(verification),
			fiscal: fiscal.length,
			documents: documents.length,
			payments: payments.length,
		},
		verification,
		fiscal,
		documents,
		payments,
		audit,
		checklist: [
			{
				id: "verification",
				label: "Verificación global",
				complete: latestVerification?.status === "approved",
				pending: latestVerification?.status === "pending" || !latestVerification,
			},
			{
				id: "fiscal",
				label: "Identidad fiscal",
				complete: fiscal.length === 0 && latestVerification?.status !== undefined,
				pending: fiscal.length > 0,
			},
			{
				id: "documents",
				label: "Documentos KYC",
				complete: documents.length === 0,
				pending: documents.length > 0,
			},
			{
				id: "payments",
				label: "Cuentas de payout",
				complete: payments.length === 0,
				pending: payments.length > 0,
			},
		],
		rejectTemplates: adminComplianceRejectTemplates,
	}
}
