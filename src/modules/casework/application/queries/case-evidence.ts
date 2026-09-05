import { createHash } from "node:crypto"

import { assessHolderNameMatch, type HolderNameMatch } from "@/lib/compliance/holder-name-match"
import { getLatestProviderVerificationStatus } from "@/lib/provider-admin-compliance"
import { listProviderDocuments } from "@/lib/provider-documents"
import { listProviderPaymentAccounts } from "@/lib/provider-payment-accounts"
import { getProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import {
	inspectProviderDocumentPreview,
	type ProviderDocumentPreviewState,
} from "@/lib/provider-document-storage"
import { db, eq, Provider } from "@/shared/infrastructure/db/compat"

import type { getCaseWorkspace } from "./command-center"

type Workspace = NonNullable<Awaited<ReturnType<typeof getCaseWorkspace>>>

export type EvidenceFact = {
	key: string
	label: string
	value: string
	tone?: "neutral" | "positive" | "warning" | "critical"
	sensitive?: boolean
}

export type EvidenceSignal = {
	key: string
	label: string
	status: "pass" | "review" | "missing" | "info"
	detail: string
}

export type CaseEvidenceReadModel = {
	domain: string
	title: string
	description: string
	sourceType: string
	sourceRef: string
	revision: string
	observedAt: string
	facts: EvidenceFact[]
	signals: EvidenceSignal[]
	artifact: null | {
		kind: "document"
		id: string
		fileName: string
		mimeType: string | null
		sizeBytes: number | null
		hasFile: boolean
		previewState: ProviderDocumentPreviewState
		previewMessage: string
	}
	approvalBlockers: string[]
	approvalWarnings: string[]
	holderMatch: HolderNameMatch | null
	reveal: null | {
		kind: "document" | "tax_registration" | "payment_account"
		label: string
		fields: string[]
	}
}

function masked(value: string | null | undefined, visible = 4) {
	const raw = String(value ?? "").trim()
	if (!raw) return "No informado"
	return raw.length <= visible ? "••••" : `•••• ${raw.slice(-visible)}`
}

function revisionOf(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
}

export async function getCaseEvidence(workspace: Workspace): Promise<CaseEvidenceReadModel> {
	const providerId = workspace.case.providerId
	const [providerRows, verification, fiscal, documents, payments] = await Promise.all([
		db.select().from(Provider).where(eq(Provider.id, providerId)).limit(1),
		getLatestProviderVerificationStatus(providerId),
		getProviderTaxConfiguration(providerId),
		listProviderDocuments(providerId),
		listProviderPaymentAccounts(providerId),
	])
	const provider = providerRows[0]
	const sourceDocument = documents.find((item) => item.id === workspace.case.sourceRef) ?? null
	const sourceDocumentPreview = sourceDocument
		? await inspectProviderDocumentPreview({ fileUrl: sourceDocument.fileUrl })
		: null
	const sourcePayment = payments.find((item) => item.id === workspace.case.sourceRef) ?? null
	const sourcePaymentHolderMatch = sourcePayment
		? assessHolderNameMatch({
				legalName: provider?.legalName,
				accountHolderName: sourcePayment.accountHolderName,
			})
		: null
	const paymentHolderMatches = payments.map((item) =>
		assessHolderNameMatch({
			legalName: provider?.legalName,
			accountHolderName: item.accountHolderName,
		})
	)
	const verifiedDocuments = documents.filter((item) => item.status === "verified")
	const pendingDocuments = documents.filter((item) => item.status === "pending")
	const commonSignals: EvidenceSignal[] = [
		{
			key: "identity_documents",
			label: "Documentación de identidad",
			status: verifiedDocuments.length ? "pass" : pendingDocuments.length ? "review" : "missing",
			detail: verifiedDocuments.length
				? `${verifiedDocuments.length} documento(s) verificado(s)`
				: pendingDocuments.length
					? `${pendingDocuments.length} documento(s) pendiente(s)`
					: "No hay documentos verificables registrados",
		},
		{
			key: "fiscal_state",
			label: "Identidad fiscal",
			status: fiscal?.status === "verified" ? "pass" : fiscal ? "review" : "missing",
			detail: fiscal?.statusLabel ?? "Sin configuración fiscal",
		},
	]

	let model: Omit<CaseEvidenceReadModel, "revision" | "observedAt">
	if (workspace.case.domain === "fiscal") {
		model = {
			domain: "fiscal",
			title: "Identidad y registro fiscal",
			description: "Datos declarados, resultado del bureau y corroboraciones asociadas.",
			sourceType: workspace.case.sourceType,
			sourceRef: workspace.case.sourceRef,
			facts: [
				{
					key: "country",
					label: "Residencia fiscal",
					value: fiscal?.taxResidenceCountry ?? "No informada",
				},
				{
					key: "registration",
					label: "Registro fiscal",
					value: masked(fiscal?.businessRegistrationNumber),
					sensitive: true,
				},
				{ key: "regime", label: "Régimen", value: fiscal?.taxRegime ?? "No informado" },
				{
					key: "invoicing",
					label: "Facturación",
					value: fiscal?.invoicingModeLabel ?? "No configurada",
				},
				{ key: "status", label: "Estado canónico", value: fiscal?.statusLabel ?? "No configurado" },
			],
			signals: [
				...commonSignals,
				{
					key: "tin_bureau",
					label: "Validación externa",
					status:
						fiscal?.tinBureau?.matchStatus === "match"
							? "pass"
							: fiscal?.tinBureau
								? "review"
								: "info",
					detail:
						fiscal?.tinBureau?.adminNarrative ??
						fiscal?.tinBureau?.message ??
						"Sin consulta de bureau registrada",
				},
			],
			artifact: null,
			approvalBlockers: [],
			approvalWarnings: [],
			holderMatch: null,
			reveal: fiscal?.businessRegistrationNumber
				? {
						kind: "tax_registration",
						label: "Revelar registro fiscal",
						fields: ["businessRegistrationNumber"],
					}
				: null,
		}
	} else if (workspace.case.domain === "documents") {
		model = {
			domain: "documents",
			title: sourceDocument?.typeLabel ?? "Documento de cumplimiento",
			description:
				"Metadatos del envío y señales de corroboración; el archivo nunca se inserta en el HTML inicial.",
			sourceType: workspace.case.sourceType,
			sourceRef: workspace.case.sourceRef,
			facts: sourceDocument
				? [
						{ key: "type", label: "Tipo", value: sourceDocument.typeLabel },
						{ key: "file", label: "Archivo", value: sourceDocument.fileName ?? "Sin nombre" },
						{ key: "mime", label: "Formato", value: sourceDocument.mimeType ?? "No informado" },
						{
							key: "size",
							label: "Tamaño",
							value: sourceDocument.sizeBytes
								? `${Math.ceil(sourceDocument.sizeBytes / 1024)} KB`
								: "No informado",
						},
						{ key: "status", label: "Estado", value: sourceDocument.statusLabel },
						{
							key: "notes",
							label: "Nota de envío",
							value: sourceDocument.submissionNotes ?? "Sin nota",
						},
					]
				: [
						{
							key: "missing",
							label: "Fuente",
							value: "El documento referenciado ya no está disponible",
							tone: "critical",
						},
					],
			signals: [
				...commonSignals,
				{
					key: "source_integrity",
					label: "Integridad de referencia",
					status: sourceDocument ? "pass" : "missing",
					detail: sourceDocument
						? "La fuente coincide con el expediente"
						: "Reconciliación requerida",
				},
			],
			artifact: sourceDocument
				? {
						kind: "document",
						id: sourceDocument.id,
						fileName: sourceDocument.fileName ?? "Documento",
						mimeType: sourceDocument.mimeType,
						sizeBytes: sourceDocument.sizeBytes,
						hasFile: Boolean(sourceDocument.fileUrl),
						previewState: sourceDocumentPreview?.state ?? "missing",
						previewMessage: sourceDocumentPreview?.message ?? "No hay archivo asociado.",
					}
				: null,
			approvalBlockers:
				sourceDocumentPreview?.state === "ready"
					? []
					: ["No se puede aprobar un documento sin un archivo disponible para corroboración."],
			approvalWarnings: [],
			holderMatch: null,
			reveal:
				sourceDocumentPreview?.state === "ready"
					? { kind: "document", label: "Abrir documento de forma segura", fields: ["fileUrl"] }
					: null,
		}
	} else if (workspace.case.domain === "payments") {
		model = {
			domain: "payments",
			title: "Titularidad de cuenta de payout",
			description:
				"Cuenta enmascarada, método de verificación y coincidencia con la identidad legal.",
			sourceType: workspace.case.sourceType,
			sourceRef: workspace.case.sourceRef,
			facts: sourcePayment
				? [
						{
							key: "holder",
							label: "Titular",
							value: sourcePayment.accountHolderName ?? "No informado",
						},
						{ key: "bank", label: "Entidad", value: sourcePayment.bankName ?? "No informada" },
						{ key: "method", label: "Método", value: sourcePayment.methodLabel },
						{
							key: "country_currency",
							label: "País y moneda",
							value: `${sourcePayment.country ?? "—"} · ${sourcePayment.currency}`,
						},
						{
							key: "account",
							label: "Cuenta",
							value: sourcePayment.accountNumberLast4
								? `•••• ${sourcePayment.accountNumberLast4}`
								: (sourcePayment.accountReference ?? "No informada"),
							sensitive: true,
						},
						{
							key: "routing",
							label: "SWIFT/routing",
							value: masked(sourcePayment.routingOrSwift),
							sensitive: true,
						},
						{
							key: "micro_deposit",
							label: "Microdepósito",
							value: sourcePayment.microDeposit.status,
						},
						{ key: "status", label: "Estado", value: sourcePayment.statusLabel },
					]
				: [
						{
							key: "missing",
							label: "Fuente",
							value: "La cuenta referenciada ya no está disponible",
							tone: "critical",
						},
					],
			signals: [
				...commonSignals,
				{
					key: "holder_match",
					label: "Coincidencia de titular",
					status:
						sourcePaymentHolderMatch?.level === "exact"
							? "pass"
							: sourcePaymentHolderMatch?.level === "insufficient"
								? "missing"
								: "review",
					detail: sourcePaymentHolderMatch
						? `${sourcePaymentHolderMatch.method}. ${sourcePaymentHolderMatch.detail}`
						: "No hay cuenta de payout para evaluar.",
				},
			],
			artifact: null,
			approvalBlockers:
				sourcePaymentHolderMatch?.level === "mismatch" ||
				sourcePaymentHolderMatch?.level === "insufficient" ||
				!sourcePaymentHolderMatch
					? ["La titularidad no está suficientemente corroborada para aprobar la cuenta de payout."]
					: [],
			approvalWarnings:
				sourcePaymentHolderMatch?.level === "probable"
					? [
							"La coincidencia de titular es probable, no exacta; explica la variación antes de aprobar.",
						]
					: [],
			holderMatch: sourcePaymentHolderMatch,
			reveal: sourcePayment
				? {
						kind: "payment_account",
						label: "Revelar identificador bancario",
						fields: ["accountIdentifier", "routingOrSwift"],
					}
				: null,
		}
	} else {
		model = {
			domain: "verification",
			title: "Identidad del negocio",
			description: "Identidad legal y corroboraciones entre documentos, fiscalidad y payout.",
			sourceType: workspace.case.sourceType,
			sourceRef: workspace.case.sourceRef,
			facts: [
				{ key: "legal_name", label: "Razón social", value: provider?.legalName ?? "No informada" },
				{
					key: "display_name",
					label: "Nombre visible",
					value: provider?.displayName ?? "No informado",
				},
				{
					key: "provider_status",
					label: "Estado del proveedor",
					value: provider?.status ?? "No informado",
				},
				{
					key: "purpose",
					label: "Propósito de cuenta",
					value: provider?.accountPurpose ?? "No informado",
				},
				{
					key: "verification",
					label: "Última verificación",
					value: verification?.status ?? "pending",
				},
			],
			signals: [
				...commonSignals,
				{
					key: "payout_holder",
					label: "Titular de payout",
					status: paymentHolderMatches.some((item) => item.level === "exact")
						? "pass"
						: payments.length
							? "review"
							: "missing",
					detail: paymentHolderMatches.some((item) => item.level === "exact")
						? "Existe una cuenta con coincidencia normalizada exacta"
						: paymentHolderMatches.some((item) => item.level === "probable")
							? "Existe una coincidencia probable; requiere corroboración humana"
							: payments.length
								? "Existe cuenta, pero la titularidad no coincide de forma suficiente"
								: "No existe cuenta de payout",
				},
			],
			artifact: null,
			approvalBlockers: [],
			approvalWarnings: [],
			holderMatch: null,
			reveal: null,
		}
	}

	const observedAt = new Date().toISOString()
	const revision = revisionOf({
		model,
		provider: provider ? { id: provider.id, createdAt: provider.createdAt } : null,
		verification,
		fiscal: fiscal
			? {
					status: fiscal.status,
					updatedAt: fiscal.updatedAt,
					bureauCheckedAt: fiscal.tinBureau?.checkedAt,
				}
			: null,
		documents: documents.map((item) => ({
			id: item.id,
			status: item.status,
			updatedAt: item.updatedAt,
			fileName: item.fileName,
			sizeBytes: item.sizeBytes,
		})),
		payments: payments.map((item) => ({
			id: item.id,
			status: item.status,
			updatedAt: item.updatedAt,
			accountNumberLast4: item.accountNumberLast4,
			microDepositStatus: item.microDeposit.status,
		})),
	})
	return { ...model, observedAt, revision }
}

export function evidenceDecisionSnapshot(evidence: CaseEvidenceReadModel) {
	return {
		sourceType: evidence.sourceType,
		sourceRef: evidence.sourceRef,
		evidenceRevision: evidence.revision,
		observedAt: evidence.observedAt,
		// The decision stores a proof of what was evaluated, not a second copy of PII.
		factKeys: evidence.facts.map(({ key }) => key),
		signals: evidence.signals.map(({ key, status }) => ({ key, status })),
		approvalBlockers: evidence.approvalBlockers,
		approvalWarnings: evidence.approvalWarnings,
		holderMatch: evidence.holderMatch
			? { level: evidence.holderMatch.level, score: evidence.holderMatch.score }
			: null,
	}
}
