import {
	first,
	and,
	db,
	desc,
	eq,
	Provider,
	ProviderAuditLog,
	ProviderConfigurationState,
	ProviderDocument,
	ProviderFinancialProfile,
	ProviderIntegrationConnection,
	ProviderPaymentAccount,
	ProviderProfile,
	ProviderTaxConfiguration,
	ProviderUser,
	ProviderVerification,
	TaxFeeDefinition,
} from "@/shared/infrastructure/db/compat"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { evaluateRequiredKycDocumentsComplete } from "@/lib/provider-documents"

export type ProviderCapability = "publish" | "booking" | "payments" | "integrations"

export type ProviderGovernanceCheck = {
	id: string
	label: string
	complete: boolean
	href: string
	capabilities: ProviderCapability[]
}

export type ProviderGovernanceIssue = {
	id: string
	label: string
	severity: "low" | "medium" | "high"
	href: string
	capabilities: ProviderCapability[]
}

export type ProviderGovernanceSummary = {
	providerId: string
	capabilities: Record<ProviderCapability, boolean>
	readiness: ProviderGovernanceCheck[]
	blockers: ProviderGovernanceIssue[]
	risks: ProviderGovernanceIssue[]
	permissions: {
		canEditProfile: boolean
		canManageFiscality: boolean
		canManagePayments: boolean
		canManageIntegrations: boolean
		canManageDocuments: boolean
		canInviteTeam: boolean
	}
	counts: {
		documents: number
		verifiedDocuments: number
		paymentAccounts: number
		verifiedPaymentAccounts: number
		integrations: number
		connectedIntegrations: number
		auditEvents: number
		teamMembers: number
	}
	progress: {
		completed: number
		total: number
		progressPercent: number
	}
}

const settingsRoutes = {
	summary: "/provider/settings",
	profile: "/provider/settings/profile",
	verification: "/provider/settings/verification",
	taxFees: "/provider/settings/tax-fees",
	payments: "/provider/settings/payments",
	integrations: "/provider/settings/integrations",
	team: "/provider/settings/team",
}

const PROVIDER_CONFIGURATION_STATE_MAX_AGE_MS = Number(
	process.env.FASTT_PROVIDER_CONFIGURATION_STATE_MAX_AGE_MS ?? 5 * 60 * 1000
)

const emptyCounts: ProviderGovernanceSummary["counts"] = {
	documents: 0,
	verifiedDocuments: 0,
	paymentAccounts: 0,
	verifiedPaymentAccounts: 0,
	integrations: 0,
	connectedIntegrations: 0,
	auditEvents: 0,
	teamMembers: 0,
}

function isMissingGovernanceStorage(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return (
		message.includes("no such table") ||
		message.includes("no such column") ||
		message.includes("has no column named")
	)
}

async function safe<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} catch (error) {
		if (isMissingGovernanceStorage(error)) return fallback
		throw error
	}
}

function issueFromCheck(check: ProviderGovernanceCheck): ProviderGovernanceIssue {
	const high = check.capabilities.includes("publish") || check.capabilities.includes("booking")
	return {
		id: check.id,
		label: check.label,
		severity: high ? "high" : "medium",
		href: check.href,
		capabilities: check.capabilities,
	}
}

function isFreshConfigurationState(value: unknown): boolean {
	const time = value ? new Date(value as any).getTime() : 0
	return Number.isFinite(time) && Date.now() - time <= PROVIDER_CONFIGURATION_STATE_MAX_AGE_MS
}

function normalizeReadiness(value: unknown): ProviderGovernanceCheck[] | null {
	if (!Array.isArray(value)) return null
	const rows = value.filter((item) => item && typeof item === "object") as Array<
		Partial<ProviderGovernanceCheck>
	>
	if (!rows.length) return null
	return rows.map((item) => ({
		id: String(item.id ?? ""),
		label: String(item.label ?? ""),
		complete: Boolean(item.complete),
		href: String(item.href ?? settingsRoutes.summary),
		capabilities: Array.isArray(item.capabilities)
			? (item.capabilities.filter((capability) =>
					["publish", "booking", "payments", "integrations"].includes(String(capability))
				) as ProviderCapability[])
			: [],
	}))
}

function normalizeIssues(value: unknown): ProviderGovernanceIssue[] {
	if (!Array.isArray(value)) return []
	return value
		.filter((item) => item && typeof item === "object")
		.map((item) => {
			const raw = item as Partial<ProviderGovernanceIssue>
			return {
				id: String(raw.id ?? ""),
				label: String(raw.label ?? ""),
				severity: ["low", "medium", "high"].includes(String(raw.severity))
					? (String(raw.severity) as ProviderGovernanceIssue["severity"])
					: "medium",
				href: String(raw.href ?? settingsRoutes.summary),
				capabilities: Array.isArray(raw.capabilities)
					? (raw.capabilities.filter((capability) =>
							["publish", "booking", "payments", "integrations"].includes(String(capability))
						) as ProviderCapability[])
					: [],
			}
		})
}

function normalizeCounts(value: unknown): ProviderGovernanceSummary["counts"] {
	if (!value || typeof value !== "object") return { ...emptyCounts }
	const raw = value as Partial<ProviderGovernanceSummary["counts"]>
	return {
		documents: Number(raw.documents ?? 0),
		verifiedDocuments: Number(raw.verifiedDocuments ?? 0),
		paymentAccounts: Number(raw.paymentAccounts ?? 0),
		verifiedPaymentAccounts: Number(raw.verifiedPaymentAccounts ?? 0),
		integrations: Number(raw.integrations ?? 0),
		connectedIntegrations: Number(raw.connectedIntegrations ?? 0),
		auditEvents: Number(raw.auditEvents ?? 0),
		teamMembers: Number(raw.teamMembers ?? 0),
	}
}

async function readCurrentUserPermissions(params: {
	providerId: string
	currentUserId?: string | null
}) {
	if (!params.currentUserId) return resolveProviderPermissions({})
	const userRow = await safe(null, () =>
		db
			.select({
				role: ProviderUser.role,
				permissionsJson: ProviderUser.permissionsJson,
			})
			.from(ProviderUser)
			.where(
				and(
					eq(ProviderUser.providerId, params.providerId),
					eq(ProviderUser.userId, params.currentUserId ?? "")
				)
			)
			.then(first)
	)
	return resolveProviderPermissions({
		role: userRow?.role,
		permissionsJson: userRow?.permissionsJson,
	})
}

export async function readProviderGovernanceFromConfigurationState(
	providerId: string,
	opts: { currentUserId?: string | null; allowStale?: boolean } = {}
): Promise<ProviderGovernanceSummary | null> {
	const id = String(providerId ?? "").trim()
	if (!id) return null
	const row = await safe(null, () =>
		db
			.select({
				providerId: ProviderConfigurationState.providerId,
				canPublish: ProviderConfigurationState.canPublish,
				canAcceptBookings: ProviderConfigurationState.canAcceptBookings,
				canCollectPayments: ProviderConfigurationState.canCollectPayments,
				canUseIntegrations: ProviderConfigurationState.canUseIntegrations,
				readinessPercent: ProviderConfigurationState.readinessPercent,
				readinessJson: ProviderConfigurationState.readinessJson,
				countsJson: ProviderConfigurationState.countsJson,
				blockersJson: ProviderConfigurationState.blockersJson,
				risksJson: ProviderConfigurationState.risksJson,
				updatedAt: ProviderConfigurationState.updatedAt,
			})
			.from(ProviderConfigurationState)
			.where(eq(ProviderConfigurationState.providerId, id))
			.then(first)
	)
	if (!row) return null
	if (!opts.allowStale && !isFreshConfigurationState(row.updatedAt)) return null
	const readiness = normalizeReadiness(row.readinessJson)
	if (!readiness) return null
	const blockers = normalizeIssues(row.blockersJson)
	const risks = normalizeIssues(row.risksJson)
	const counts = normalizeCounts(row.countsJson)
	const completed = readiness.filter((item) => item.complete).length
	const total = readiness.length
	return {
		providerId: id,
		capabilities: {
			publish: Boolean(row.canPublish),
			booking: Boolean(row.canAcceptBookings),
			payments: Boolean(row.canCollectPayments),
			integrations: Boolean(row.canUseIntegrations),
		},
		readiness,
		blockers,
		risks,
		permissions: await readCurrentUserPermissions({
			providerId: id,
			currentUserId: opts.currentUserId,
		}),
		counts,
		progress: {
			completed,
			total,
			progressPercent: Number(row.readinessPercent ?? Math.round((completed / total) * 100)),
		},
	}
}

export async function evaluateProviderGovernance(
	providerId: string,
	opts: { currentUserId?: string | null; persist?: boolean } = {}
): Promise<ProviderGovernanceSummary> {
	const id = String(providerId ?? "").trim()
	if (!id) throw new Error("PROVIDER_REQUIRED")

	const [
		base,
		latestVerification,
		documentRows,
		taxConfiguration,
		taxDefinitions,
		paymentAccounts,
		financialProfile,
		integrationRows,
		auditRows,
		teamRows,
	] = await Promise.all([
		db
			.select({
				provider: {
					id: Provider.id,
					displayName: Provider.displayName,
					legalName: Provider.legalName,
					status: Provider.status,
				},
				profile: {
					timezone: ProviderProfile.timezone,
					defaultCurrency: ProviderProfile.defaultCurrency,
					supportEmail: ProviderProfile.supportEmail,
					supportPhone: ProviderProfile.supportPhone,
				},
			})
			.from(Provider)
			.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Provider.id))
			.where(eq(Provider.id, id))
			.then(first),
		db
			.select({
				status: ProviderVerification.status,
				reason: ProviderVerification.reason,
				createdAt: ProviderVerification.createdAt,
			})
			.from(ProviderVerification)
			.where(eq(ProviderVerification.providerId, id))
			.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
			.then(first),
		safe([], () =>
			db
				.select({
					id: ProviderDocument.id,
					status: ProviderDocument.status,
					type: ProviderDocument.type,
				})
				.from(ProviderDocument)
				.where(eq(ProviderDocument.providerId, id))
		),
		safe(null, () =>
			db
				.select({
					status: ProviderTaxConfiguration.status,
					taxResidenceCountry: ProviderTaxConfiguration.taxResidenceCountry,
					businessRegistrationNumber: ProviderTaxConfiguration.businessRegistrationNumber,
				})
				.from(ProviderTaxConfiguration)
				.where(eq(ProviderTaxConfiguration.providerId, id))
				.then(first)
		),
		db
			.select({ id: TaxFeeDefinition.id, status: TaxFeeDefinition.status })
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.providerId, id))

			.catch(() => []),
		safe([], () =>
			db
				.select({
					id: ProviderPaymentAccount.id,
					status: ProviderPaymentAccount.status,
				})
				.from(ProviderPaymentAccount)
				.where(eq(ProviderPaymentAccount.providerId, id))
		),
		db
			.select({
				status: ProviderFinancialProfile.status,
				taxProfileStatus: ProviderFinancialProfile.taxProfileStatus,
			})
			.from(ProviderFinancialProfile)
			.where(eq(ProviderFinancialProfile.providerId, id))
			.then(first)
			.catch(() => null),
		safe([], () =>
			db
				.select({
					id: ProviderIntegrationConnection.id,
					status: ProviderIntegrationConnection.status,
					mode: ProviderIntegrationConnection.mode,
					lastSyncStatus: ProviderIntegrationConnection.lastSyncStatus,
				})
				.from(ProviderIntegrationConnection)
				.where(eq(ProviderIntegrationConnection.providerId, id))
		),
		safe([], () =>
			db
				.select({ id: ProviderAuditLog.id })
				.from(ProviderAuditLog)
				.where(eq(ProviderAuditLog.providerId, id))
				.limit(20)
		),
		safe([], () =>
			db
				.select({
					userId: ProviderUser.userId,
					role: ProviderUser.role,
					permissionsJson: ProviderUser.permissionsJson,
				})
				.from(ProviderUser)
				.where(eq(ProviderUser.providerId, id))
		),
	])

	if (!base?.provider?.id) throw new Error("PROVIDER_NOT_FOUND")

	const provider = base.provider
	const profile = base.profile
	const activeTaxDefinitions = taxDefinitions.filter((row) => row.status === "active")
	const verifiedDocuments = documentRows.filter((row) => row.status === "verified")
	const pendingDocuments = documentRows.filter((row) => row.status === "pending")
	const verifiedPaymentAccounts = paymentAccounts.filter((row) => row.status === "verified")
	// Airbnb/Expedia: a connector is "ready" only after a real connectivity/smoke test,
	// not merely because credentials were saved.
	const connectedIntegrations = integrationRows.filter((row) => {
		if (String(row.status) !== "connected") return false
		const sync = String(row.lastSyncStatus ?? "").toLowerCase()
		return sync === "success" || sync === "ok"
	})
	const pendingSmokeIntegrations = integrationRows.filter((row) =>
		["pending", "syncing"].includes(String(row.status))
	)
	const fiscalStatus = String(taxConfiguration?.status ?? "")
	const taxResidenceCountry = taxConfiguration?.taxResidenceCountry ?? null
	const hasTaxpayerIdentityDraft = Boolean(
		taxResidenceCountry || taxConfiguration?.businessRegistrationNumber
	)

	const identityComplete = Boolean(provider.displayName?.trim() && provider.legalName?.trim())
	const operationsComplete = Boolean(
		profile?.timezone?.trim() && profile?.defaultCurrency?.trim() && profile?.supportEmail?.trim()
	)
	const verificationComplete = latestVerification?.status === "approved"
	// Minimum KYC set (gov ID + business registration + tax doc), all verified.
	const kycDocuments = evaluateRequiredKycDocumentsComplete(documentRows)
	const documentsComplete = kycDocuments.complete
	// Taxpayer identity must be admin-verified. Active sales tax fees + country are NOT a substitute.
	const fiscalComplete = fiscalStatus === "verified"
	// FinancialProfile is a rollup after payout verify — never a self-serve readiness shortcut.
	const paymentsComplete = verifiedPaymentAccounts.length > 0
	const integrationsReady = connectedIntegrations.length > 0
	const teamComplete = teamRows.some((row) => ["owner", "admin"].includes(String(row.role)))
	const currentUserLink = opts.currentUserId
		? teamRows.find((row) => row.userId === opts.currentUserId)
		: null
	const permissions = resolveProviderPermissions({
		role: currentUserLink?.role,
		permissionsJson: currentUserLink?.permissionsJson,
	})

	const readiness: ProviderGovernanceCheck[] = [
		{
			id: "identity",
			label: "Identidad comercial completa",
			complete: identityComplete,
			href: settingsRoutes.profile,
			capabilities: ["publish", "booking", "payments", "integrations"],
		},
		{
			id: "operations",
			label: "Perfil operativo completo",
			complete: operationsComplete,
			href: settingsRoutes.profile,
			capabilities: ["publish", "booking"],
		},
		{
			id: "verification",
			label: "Proveedor aprobado por cumplimiento",
			complete: verificationComplete,
			href: settingsRoutes.verification,
			capabilities: ["publish", "booking", "payments", "integrations"],
		},
		{
			id: "documents",
			label: "Documentos KYC mínimos verificados",
			complete: documentsComplete,
			href: settingsRoutes.verification,
			capabilities: ["payments", "integrations"],
		},
		{
			id: "fiscality",
			label: "Identidad fiscal verificada",
			complete: fiscalComplete,
			href: settingsRoutes.taxFees,
			capabilities: ["publish", "booking", "payments"],
		},
		{
			id: "payments",
			label: "Cuenta de pago verificada",
			complete: paymentsComplete,
			href: settingsRoutes.payments,
			capabilities: ["payments"],
		},
		{
			id: "integrations",
			label: "Integraciones con prueba de sync exitosa",
			complete: integrationsReady,
			href: settingsRoutes.integrations,
			capabilities: ["integrations"],
		},
		{
			id: "team",
			label: "Propietario y permisos base",
			complete: teamComplete,
			href: settingsRoutes.team,
			capabilities: ["publish", "booking", "payments", "integrations"],
		},
	]

	const requiredFor = (capability: ProviderCapability) =>
		readiness.filter((item) => item.capabilities.includes(capability))

	const capabilities = {
		publish: requiredFor("publish").every((item) => item.complete),
		booking: requiredFor("booking").every((item) => item.complete),
		payments: requiredFor("payments").every((item) => item.complete),
		integrations: requiredFor("integrations").every((item) => item.complete),
	}

	const blockers = readiness
		.filter((item) => !item.complete && item.id !== "integrations")
		.map(issueFromCheck)
	const risks: ProviderGovernanceIssue[] = [
		...(integrationsReady
			? []
			: [
					{
						id: "integrations_not_ready",
						label: "No hay integraciones con smoke test exitoso",
						severity: "low" as const,
						href: settingsRoutes.integrations,
						capabilities: ["integrations"] as ProviderCapability[],
					},
				]),
		...(pendingSmokeIntegrations.length > 0
			? [
					{
						id: "integrations_smoke_pending",
						label: "Hay conectores configurados pendientes de prueba de sync",
						severity: "medium" as const,
						href: settingsRoutes.integrations,
						capabilities: ["integrations"] as ProviderCapability[],
					},
				]
			: []),
		...(activeTaxDefinitions.length === 0
			? [
					{
						id: "tax_definitions_missing",
						label: "No hay impuestos/cargos de venta activos",
						severity: "medium" as const,
						href: settingsRoutes.taxFees,
						capabilities: ["booking", "payments"] as ProviderCapability[],
					},
				]
			: []),
		// Former fiscalComplete shortcut: commercial tax tools ≠ verified taxpayer identity.
		...(!fiscalComplete &&
		activeTaxDefinitions.length > 0 &&
		Boolean(taxResidenceCountry) &&
		fiscalStatus !== "pending" &&
		fiscalStatus !== "requires_attention"
			? [
					{
						id: "taxpayer_unverified_with_tax_fees",
						label:
							"Hay impuestos de venta activos, pero la identidad fiscal aún no está verificada",
						severity: "high" as const,
						href: settingsRoutes.taxFees,
						capabilities: ["publish", "booking", "payments"] as ProviderCapability[],
					},
				]
			: []),
		...(!fiscalComplete &&
		hasTaxpayerIdentityDraft &&
		(fiscalStatus === "pending" || fiscalStatus === "requires_attention")
			? [
					{
						id: "fiscal_pending_verification",
						label: "Identidad fiscal enviada y pendiente de validación interna",
						severity: "high" as const,
						href: settingsRoutes.taxFees,
						capabilities: ["publish", "booking", "payments"] as ProviderCapability[],
					},
				]
			: []),
		...(!documentsComplete && pendingDocuments.length > 0
			? [
					{
						id: "documents_pending_review",
						label: "Hay documentos enviados pendientes de verificación interna",
						severity: "medium" as const,
						href: settingsRoutes.verification,
						capabilities: ["payments", "integrations"] as ProviderCapability[],
					},
				]
			: []),
		...(!documentsComplete && kycDocuments.missingRequiredTypes.length > 0
			? [
					{
						id: "documents_kyc_set_incomplete",
						label: `Faltan documentos KYC verificados: ${kycDocuments.missingRequiredTypes.join(", ")}`,
						severity: "high" as const,
						href: settingsRoutes.verification,
						capabilities: ["payments", "integrations"] as ProviderCapability[],
					},
				]
			: []),
		// FinancialProfile ready without a verified payout method is a rollup inconsistency.
		...(!paymentsComplete && ["active", "ready"].includes(String(financialProfile?.status ?? ""))
			? [
					{
						id: "financial_profile_without_verified_payout",
						label: "Perfil financiero marcado listo sin cuenta de payout verificada",
						severity: "high" as const,
						href: settingsRoutes.payments,
						capabilities: ["payments"] as ProviderCapability[],
					},
				]
			: []),
	]

	const completed = readiness.filter((item) => item.complete).length
	const total = readiness.length
	const summary: ProviderGovernanceSummary = {
		providerId: id,
		capabilities,
		readiness,
		blockers,
		risks,
		permissions,
		counts: {
			documents: documentRows.length,
			verifiedDocuments: verifiedDocuments.length,
			paymentAccounts: paymentAccounts.length,
			verifiedPaymentAccounts: verifiedPaymentAccounts.length,
			integrations: integrationRows.length,
			connectedIntegrations: connectedIntegrations.length,
			auditEvents: auditRows.length,
			teamMembers: teamRows.length,
		},
		progress: {
			completed,
			total,
			progressPercent: Math.round((completed / total) * 100),
		},
	}

	if (opts.persist) {
		await safe(undefined, async () => {
			const values = {
				providerId: id,
				canPublish: summary.capabilities.publish,
				canAcceptBookings: summary.capabilities.booking,
				canCollectPayments: summary.capabilities.payments,
				canUseIntegrations: summary.capabilities.integrations,
				readinessPercent: summary.progress.progressPercent,
				readinessJson: summary.readiness,
				countsJson: summary.counts,
				blockersJson: summary.blockers,
				risksJson: summary.risks,
				updatedAt: new Date(),
			}
			await db
				.insert(ProviderConfigurationState)
				.values(values)
				.onConflictDoUpdate({
					target: [ProviderConfigurationState.providerId],
					set: {
						canPublish: values.canPublish,
						canAcceptBookings: values.canAcceptBookings,
						canCollectPayments: values.canCollectPayments,
						canUseIntegrations: values.canUseIntegrations,
						readinessPercent: values.readinessPercent,
						readinessJson: values.readinessJson,
						countsJson: values.countsJson,
						blockersJson: values.blockersJson,
						risksJson: values.risksJson,
						updatedAt: values.updatedAt,
					},
				})
		})
	}

	return summary
}

export async function refreshProviderConfigurationState(params: {
	providerId: string
	currentUserId?: string | null
}): Promise<ProviderGovernanceSummary> {
	return evaluateProviderGovernance(params.providerId, {
		currentUserId: params.currentUserId,
		persist: true,
	})
}

export async function assertProviderCapability(params: {
	providerId: string
	capability: ProviderCapability
	currentUserId?: string | null
}): Promise<ProviderGovernanceSummary> {
	const summary = await evaluateProviderGovernance(params.providerId, {
		currentUserId: params.currentUserId,
		persist: true,
	})
	const enforceInVitest = process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE === "1"
	const skipEnforcementInTests = Boolean(process.env.VITEST) && !enforceInVitest
	if (!summary.capabilities[params.capability] && !skipEnforcementInTests) {
		const blockers = summary.blockers.filter((blocker) =>
			blocker.capabilities.includes(params.capability)
		)
		const error = new Error(`PROVIDER_CONFIGURATION_BLOCKED:${params.capability}`)
		;(error as any).details = {
			capability: params.capability,
			blockers,
			risks: summary.risks.filter((risk) => risk.capabilities.includes(params.capability)),
		}
		throw error
	}
	return summary
}
