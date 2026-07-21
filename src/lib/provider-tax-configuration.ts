import { and, db, eq, ProviderTaxConfiguration, ProviderUser } from "astro:db"

import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

/**
 * Provider fiscal identity (taxpayer / tax registration).
 *
 * Airbnb separates Account > Taxes > Taxpayers (who you are for reporting/withholding)
 * from listing occupancy taxes charged to guests.
 * Expedia separates Financials > Tax and Registration from property taxes/fees on bookings.
 *
 * Source of truth: ProviderTaxConfiguration
 * Commercial sales taxes/fees: TaxFeeDefinition + TaxFeeAssignment
 */
export type ProviderTaxConfigurationStatus =
	| "not_configured"
	| "pending"
	| "verified"
	| "requires_attention"

export type ProviderInvoicingMode = "platform_receipt" | "provider_invoice" | "hybrid"

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
}

export const providerTaxConfigurationStatuses: Array<{
	value: ProviderTaxConfigurationStatus
	label: string
}> = [
	{ value: "not_configured", label: "No configurado" },
	{ value: "pending", label: "Pendiente de validación" },
	{ value: "verified", label: "Verificado" },
	{ value: "requires_attention", label: "Requiere atención" },
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

function mapRow(row: {
	providerId: string
	status: string
	taxResidenceCountry: string | null
	businessRegistrationNumber: string | null
	taxRegime: string | null
	invoicingMode: string
	updatedAt: Date | null
	updatedBy: string | null
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
	}
}

async function getProviderRole(providerId: string, userId: string) {
	return (
		(await db
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
			.get()) ?? null
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
		})
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, providerId))
		.get()
		.catch(() => null)

	return row ? mapRow(row) : null
}

export async function upsertProviderTaxConfiguration(params: {
	providerId: string
	actorUserId: string
	status?: unknown
	taxResidenceCountry?: unknown
	businessRegistrationNumber?: unknown
	taxRegime?: unknown
	invoicingMode?: unknown
}) {
	await assertCanManageFiscality(params.providerId, params.actorUserId)

	const taxResidenceCountry =
		String(params.taxResidenceCountry ?? "")
			.trim()
			.toUpperCase() || null
	const businessRegistrationNumber = String(params.businessRegistrationNumber ?? "").trim() || null
	const taxRegime = String(params.taxRegime ?? "").trim() || null
	const status = asStatus(params.status)
	const invoicingMode = asInvoicingMode(params.invoicingMode)

	if (taxResidenceCountry && !/^[A-Z]{2}$/.test(taxResidenceCountry)) {
		const error = new Error("invalid_tax_residence_country")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const before = await getProviderTaxConfiguration(params.providerId)
	const now = new Date()
	const values = {
		providerId: params.providerId,
		status,
		taxResidenceCountry: taxResidenceCountry ?? undefined,
		businessRegistrationNumber: businessRegistrationNumber ?? undefined,
		taxRegime: taxRegime ?? undefined,
		invoicingMode,
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
				}
			: null,
		riskLevel: inferSettingsRiskLevel({ domain: "fiscal" }),
	})

	return after!
}
