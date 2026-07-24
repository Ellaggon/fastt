import {
	first,
	and,
	db,
	eq,
	Provider,
	ProviderTaxConfiguration,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"

import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { completeComplianceAssignment } from "@/lib/provider-compliance-ops"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { validateTaxpayerRegistrationNumber } from "@/lib/provider-tax-identity-validation"
import {
	checkTinBureauMatch,
	tinBureauMatchLabel,
	tinBureauMatchTone,
	type TinBureauMatchStatus,
} from "@/lib/tin-bureau"

/**
 * Provider fiscal identity (taxpayer / tax registration).
 *
 * Airbnb: host submits taxpayer forms; platform validates (e.g. IRS TIN matching).
 * Host cannot self-certify "verified".
 * Expedia: Tax & Registration data is submitted; compliance holds are platform-driven.
 *
 * Source of truth: ProviderTaxConfiguration
 * Commercial sales taxes/fees: TaxFeeDefinition + TaxFeeAssignment
 *
 * Status ownership:
 * - Provider path may only produce not_configured | pending (derived from identity fields).
 * - verified | requires_attention require internal admin review.
 */
export type ProviderTaxConfigurationStatus =
	| "not_configured"
	| "pending"
	| "verified"
	| "requires_attention"

export type ProviderInvoicingMode = "platform_receipt" | "provider_invoice" | "hybrid"

export type ProviderTaxBureauSnapshot = {
	provider: string
	mode: string
	matchStatus: TinBureauMatchStatus | string
	matchLabel: string
	matchTone: "success" | "warning" | "error" | "info" | "neutral"
	externalRef: string | null
	message: string
	hostNarrative: string
	adminNarrative: string
	checkedAt: string | null
}

export type ProviderTaxConfigurationRecord = {
	providerId: string
	status: ProviderTaxConfigurationStatus
	statusLabel: string
	taxResidenceCountry: string | null
	businessRegistrationNumber: string | null
	taxRegime: string | null
	invoicingMode: ProviderInvoicingMode
	invoicingModeLabel: string
	updatedAt: Date | null
	updatedBy: string | null
	isConfigured: boolean
	tinBureau: ProviderTaxBureauSnapshot | null
}

export const providerTaxConfigurationStatuses: Array<{
	value: ProviderTaxConfigurationStatus
	label: string
}> = [
	{ value: "not_configured", label: "No configurado" },
	{ value: "pending", label: "En revisión" },
	{ value: "verified", label: "Verificado" },
	{ value: "requires_attention", label: "Requiere atención" },
]

/** Statuses an internal admin may set when reviewing taxpayer identity. */
export const providerTaxAdminReviewStatuses = [
	{ value: "verified" as const, label: "Verificado" },
	{ value: "requires_attention" as const, label: "Requiere atención" },
	{ value: "pending" as const, label: "Volver a pendiente" },
]

export const providerInvoicingModes: Array<{
	value: ProviderInvoicingMode
	label: string
	description: string
}> = [
	{
		value: "platform_receipt",
		label: "Recibo de plataforma",
		description: "La plataforma emite el comprobante al huésped.",
	},
	{
		value: "provider_invoice",
		label: "Factura del proveedor",
		description: "El proveedor factura directamente al huésped.",
	},
	{
		value: "hybrid",
		label: "Híbrido",
		description: "Combinación según canal o tipo de cargo.",
	},
]

export const providerTaxRegimes = [
	{ value: "general", label: "Régimen general" },
	{ value: "simplified", label: "Régimen simplificado" },
	{ value: "exempt", label: "Exento / no sujeto" },
	{ value: "withholding", label: "Sujeto a retención" },
] as const

const statusLabels = Object.fromEntries(
	providerTaxConfigurationStatuses.map((item) => [item.value, item.label])
) as Record<ProviderTaxConfigurationStatus, string>

const invoicingLabels = Object.fromEntries(
	providerInvoicingModes.map((item) => [item.value, item.label])
) as Record<ProviderInvoicingMode, string>

function asStatus(value: unknown): ProviderTaxConfigurationStatus {
	const raw = String(value ?? "not_configured").trim()
	if (
		raw === "pending" ||
		raw === "verified" ||
		raw === "requires_attention" ||
		raw === "not_configured"
	) {
		return raw
	}
	return "not_configured"
}

function asInvoicingMode(value: unknown): ProviderInvoicingMode {
	const raw = String(value ?? "platform_receipt").trim()
	if (raw === "provider_invoice" || raw === "hybrid" || raw === "platform_receipt") return raw
	return "platform_receipt"
}

/**
 * Provider edits never self-certify. Identity present → pending review;
 * empty identity → not_configured. Editing after verified forces revalidation.
 */
export function deriveProviderTaxStatus(params: {
	taxResidenceCountry: string | null
	businessRegistrationNumber: string | null
	taxRegime: string | null
}): ProviderTaxConfigurationStatus {
	const hasIdentity = Boolean(
		params.taxResidenceCountry || params.businessRegistrationNumber || params.taxRegime
	)
	return hasIdentity ? "pending" : "not_configured"
}

function readTinBureauSnapshot(metadataJson: unknown): ProviderTaxBureauSnapshot | null {
	if (!metadataJson || typeof metadataJson !== "object" || Array.isArray(metadataJson)) return null
	const raw = (metadataJson as Record<string, unknown>).tinBureau
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
	const row = raw as Record<string, unknown>
	const matchStatus = String(row.matchStatus ?? "not_checked")
	return {
		provider: String(row.provider ?? "format_only"),
		mode: String(row.mode ?? "format_only"),
		matchStatus,
		matchLabel: tinBureauMatchLabel(matchStatus),
		matchTone: tinBureauMatchTone(matchStatus),
		externalRef: row.externalRef == null ? null : String(row.externalRef),
		message: String(row.message ?? ""),
		hostNarrative: String(row.hostNarrative ?? row.message ?? ""),
		adminNarrative: String(row.adminNarrative ?? row.message ?? ""),
		checkedAt: row.checkedAt == null ? null : String(row.checkedAt),
	}
}

function mapRow(row: {
	providerId: string
	status: string
	taxResidenceCountry: string | null
	businessRegistrationNumber: string | null
	taxRegime: string | null
	invoicingMode: string
	updatedAt: Date | null
	updatedBy: string | null
	metadataJson?: unknown
}): ProviderTaxConfigurationRecord {
	const status = asStatus(row.status)
	const invoicingMode = asInvoicingMode(row.invoicingMode)
	return {
		providerId: row.providerId,
		status,
		statusLabel: statusLabels[status],
		taxResidenceCountry: row.taxResidenceCountry ?? null,
		businessRegistrationNumber: row.businessRegistrationNumber ?? null,
		taxRegime: row.taxRegime ?? null,
		invoicingMode,
		invoicingModeLabel: invoicingLabels[invoicingMode],
		updatedAt: row.updatedAt ?? null,
		updatedBy: row.updatedBy ?? null,
		isConfigured: Boolean(
			status !== "not_configured" ||
			row.taxResidenceCountry ||
			row.businessRegistrationNumber ||
			row.taxRegime
		),
		tinBureau: readTinBureauSnapshot(row.metadataJson),
	}
}

async function getProviderRole(providerId: string, userId: string) {
	return (
		(await db
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
			.then(first)) ?? null
	)
}

export async function assertCanManageFiscality(providerId: string, userId: string) {
	const link = await getProviderRole(providerId, userId)
	const permissions = resolveProviderPermissions({
		role: link?.role,
		permissionsJson: link?.permissionsJson,
	})
	if (!permissions.canManageFiscality) {
		const error = new Error("forbidden")
		;(error as Error & { status?: number }).status = 403
		throw error
	}
	return { link, permissions }
}

export async function getProviderTaxConfiguration(
	providerId: string
): Promise<ProviderTaxConfigurationRecord | null> {
	const row = await db
		.select({
			providerId: ProviderTaxConfiguration.providerId,
			status: ProviderTaxConfiguration.status,
			taxResidenceCountry: ProviderTaxConfiguration.taxResidenceCountry,
			businessRegistrationNumber: ProviderTaxConfiguration.businessRegistrationNumber,
			taxRegime: ProviderTaxConfiguration.taxRegime,
			invoicingMode: ProviderTaxConfiguration.invoicingMode,
			updatedAt: ProviderTaxConfiguration.updatedAt,
			updatedBy: ProviderTaxConfiguration.updatedBy,
			metadataJson: ProviderTaxConfiguration.metadataJson,
		})
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, providerId))
		.then(first)
		.catch(() => null)

	return row ? mapRow(row) : null
}

export async function listProviderTaxConfigurationsForAdmin(): Promise<
	ProviderTaxConfigurationRecord[]
> {
	const rows = await db
		.select({
			providerId: ProviderTaxConfiguration.providerId,
			status: ProviderTaxConfiguration.status,
			taxResidenceCountry: ProviderTaxConfiguration.taxResidenceCountry,
			businessRegistrationNumber: ProviderTaxConfiguration.businessRegistrationNumber,
			taxRegime: ProviderTaxConfiguration.taxRegime,
			invoicingMode: ProviderTaxConfiguration.invoicingMode,
			updatedAt: ProviderTaxConfiguration.updatedAt,
			updatedBy: ProviderTaxConfiguration.updatedBy,
			metadataJson: ProviderTaxConfiguration.metadataJson,
		})
		.from(ProviderTaxConfiguration)

		.catch(() => [])

	return rows.map(mapRow)
}

/**
 * Provider-facing upsert. Ignores any client-supplied terminal status and derives
 * not_configured | pending from identity fields (Airbnb-style: submit data, await validation).
 */
export async function upsertProviderTaxConfiguration(params: {
	providerId: string
	actorUserId: string
	taxResidenceCountry?: unknown
	businessRegistrationNumber?: unknown
	taxRegime?: unknown
	invoicingMode?: unknown
	/** @deprecated Ignored. Provider cannot set verified / requires_attention. */
	status?: unknown
}) {
	await assertCanManageFiscality(params.providerId, params.actorUserId)

	const taxResidenceCountry =
		String(params.taxResidenceCountry ?? "")
			.trim()
			.toUpperCase() || null
	const registrationValidation = validateTaxpayerRegistrationNumber({
		country: taxResidenceCountry,
		registrationNumber:
			params.businessRegistrationNumber == null ? null : String(params.businessRegistrationNumber),
		required: false,
	})
	if (!registrationValidation.ok) {
		const error = new Error(registrationValidation.code || "invalid_tax_registration")
		;(error as Error & { status?: number; message?: string }).status = 400
		;(error as Error & { message: string }).message =
			registrationValidation.message || "invalid_tax_registration"
		throw error
	}
	const businessRegistrationNumber: string | null = registrationValidation.normalized
	const taxRegime = String(params.taxRegime ?? "").trim() || null
	const status = deriveProviderTaxStatus({
		taxResidenceCountry,
		businessRegistrationNumber,
		taxRegime,
	})
	const invoicingMode = asInvoicingMode(params.invoicingMode)

	if (taxResidenceCountry && !/^[A-Z]{2}$/.test(taxResidenceCountry)) {
		const error = new Error("invalid_tax_residence_country")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const before = await getProviderTaxConfiguration(params.providerId)
	const now = new Date()

	const existingMeta = await db
		.select({ metadataJson: ProviderTaxConfiguration.metadataJson })
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, params.providerId))
		.then(first)
		.catch(() => null)
	const prevMeta =
		existingMeta?.metadataJson &&
		typeof existingMeta.metadataJson === "object" &&
		!Array.isArray(existingMeta.metadataJson)
			? (existingMeta.metadataJson as Record<string, unknown>)
			: {}

	const bureau =
		businessRegistrationNumber != null
			? await (async () => {
					const providerRow = await db
						.select({
							legalName: Provider.legalName,
							displayName: Provider.displayName,
						})
						.from(Provider)
						.where(eq(Provider.id, params.providerId))
						.then(first)
						.catch(() => null)
					const legalName =
						String(providerRow?.legalName ?? "").trim() ||
						String(providerRow?.displayName ?? "").trim() ||
						null
					return checkTinBureauMatch({
						providerId: params.providerId,
						country: taxResidenceCountry,
						taxpayerId: businessRegistrationNumber,
						legalName,
					})
				})()
			: null

	const values = {
		providerId: params.providerId,
		status,
		taxResidenceCountry: taxResidenceCountry ?? undefined,
		businessRegistrationNumber: businessRegistrationNumber ?? undefined,
		taxRegime: taxRegime ?? undefined,
		invoicingMode,
		metadataJson: {
			...prevMeta,
			tinBureau: bureau
				? {
						provider: bureau.provider,
						mode: bureau.mode,
						matchStatus: bureau.matchStatus,
						externalRef: bureau.externalRef,
						message: bureau.message,
						hostNarrative: bureau.hostNarrative,
						adminNarrative: bureau.adminNarrative,
						checkedAt: now.toISOString(),
					}
				: (prevMeta.tinBureau ?? null),
		},
		updatedAt: now,
		updatedBy: params.actorUserId,
	}

	await db
		.insert(ProviderTaxConfiguration)
		.values(values)
		.onConflictDoUpdate({
			target: [ProviderTaxConfiguration.providerId],
			set: {
				status: values.status,
				taxResidenceCountry: values.taxResidenceCountry,
				businessRegistrationNumber: values.businessRegistrationNumber,
				taxRegime: values.taxRegime,
				invoicingMode: values.invoicingMode,
				metadataJson: values.metadataJson,
				updatedAt: values.updatedAt,
				updatedBy: values.updatedBy,
			},
		})

	const after = await getProviderTaxConfiguration(params.providerId)

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.tax_configuration.upsert",
		entityType: "ProviderTaxConfiguration",
		entityId: params.providerId,
		beforeJson: before
			? {
					status: before.status,
					taxResidenceCountry: before.taxResidenceCountry,
					businessRegistrationNumber: before.businessRegistrationNumber,
					taxRegime: before.taxRegime,
					invoicingMode: before.invoicingMode,
				}
			: null,
		afterJson: after
			? {
					status: after.status,
					taxResidenceCountry: after.taxResidenceCountry,
					businessRegistrationNumber: after.businessRegistrationNumber,
					taxRegime: after.taxRegime,
					invoicingMode: after.invoicingMode,
					tinBureauMatch: bureau?.matchStatus ?? null,
					tinBureauMode: bureau?.mode ?? null,
					tinBureauNarrative: bureau?.adminNarrative ?? null,
				}
			: null,
		riskLevel: inferSettingsRiskLevel({ domain: "fiscal" }),
	})

	return after!
}

/**
 * Internal-admin review of taxpayer identity. Caller must already have passed
 * requireInternalAdmin — this function does not check provider-role permissions.
 */
export async function reviewProviderTaxConfiguration(params: {
	providerId: string
	actorUserId: string
	status: unknown
	reason?: unknown
}) {
	const nextStatus = asStatus(params.status)
	if (
		nextStatus !== "verified" &&
		nextStatus !== "requires_attention" &&
		nextStatus !== "pending"
	) {
		const error = new Error("invalid_review_status")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const reason = String(params.reason ?? "").trim()
	if (nextStatus === "requires_attention" && reason.length < 2) {
		const error = new Error("reason_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const before = await getProviderTaxConfiguration(params.providerId)
	if (!before) {
		const error = new Error("not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}

	if (nextStatus === "verified") {
		const tin = validateTaxpayerRegistrationNumber({
			country: before.taxResidenceCountry,
			registrationNumber: before.businessRegistrationNumber,
			required: true,
		})
		if (!tin.ok) {
			const error = new Error(tin.code || "invalid_tax_registration")
			;(error as Error & { status?: number }).status = 400
			;(error as Error & { message: string }).message =
				tin.message || "No se puede verificar con un número fiscal inválido."
			throw error
		}
	}

	const now = new Date()
	const existingMeta =
		(
			await db
				.select({ metadataJson: ProviderTaxConfiguration.metadataJson })
				.from(ProviderTaxConfiguration)
				.where(eq(ProviderTaxConfiguration.providerId, params.providerId))
				.then(first)
				.catch(() => null)
		)?.metadataJson ?? {}

	const metadataJson = {
		...(typeof existingMeta === "object" && existingMeta && !Array.isArray(existingMeta)
			? existingMeta
			: {}),
		lastReview: {
			status: nextStatus,
			reason: reason || null,
			reviewedAt: now.toISOString(),
			reviewedBy: params.actorUserId,
		},
	}

	await db
		.update(ProviderTaxConfiguration)
		.set({
			status: nextStatus,
			metadataJson,
			updatedAt: now,
			updatedBy: params.actorUserId,
		})
		.where(eq(ProviderTaxConfiguration.providerId, params.providerId))

	const after = await getProviderTaxConfiguration(params.providerId)

	await completeComplianceAssignment({
		providerId: params.providerId,
		domain: "fiscal",
		entityId: params.providerId,
	})

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.tax_configuration.review",
		entityType: "ProviderTaxConfiguration",
		entityId: params.providerId,
		beforeJson: { status: before.status },
		afterJson: { status: nextStatus, reason: reason || null },
		riskLevel: inferSettingsRiskLevel({ domain: "fiscal" }),
	})

	return after!
}
