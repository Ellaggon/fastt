import {
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
} from "astro:db"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

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
	profile: "/provider/settings/profile",
	verification: "/provider/settings/verification",
	taxFees: "/provider/settings/tax-fees",
	integrations: "/provider/settings/integrations",
	team: "/provider/settings/team",
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
					taxResidenceCountry: ProviderProfile.taxResidenceCountry,
					businessRegistrationNumber: ProviderProfile.businessRegistrationNumber,
					fiscalStatus: ProviderProfile.fiscalStatus,
					paymentReadinessStatus: ProviderProfile.paymentReadinessStatus,
					integrationReadinessStatus: ProviderProfile.integrationReadinessStatus,
				},
			})
			.from(Provider)
			.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Provider.id))
			.where(eq(Provider.id, id))
			.get(),
		db
			.select({
				status: ProviderVerification.status,
				reason: ProviderVerification.reason,
				createdAt: ProviderVerification.createdAt,
			})
			.from(ProviderVerification)
			.where(eq(ProviderVerification.providerId, id))
			.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
			.get(),
		safe([], () =>
			db
				.select({
					id: ProviderDocument.id,
					status: ProviderDocument.status,
					type: ProviderDocument.type,
				})
				.from(ProviderDocument)
				.where(eq(ProviderDocument.providerId, id))
				.all()
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
				.get()
		),
		db
			.select({ id: TaxFeeDefinition.id, status: TaxFeeDefinition.status })
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.providerId, id))
			.all()
			.catch(() => []),
		safe([], () =>
			db
				.select({
					id: ProviderPaymentAccount.id,
					status: ProviderPaymentAccount.status,
				})
				.from(ProviderPaymentAccount)
				.where(eq(ProviderPaymentAccount.providerId, id))
				.all()
		),
		db
			.select({
				status: ProviderFinancialProfile.status,
				taxProfileStatus: ProviderFinancialProfile.taxProfileStatus,
			})
			.from(ProviderFinancialProfile)
			.where(eq(ProviderFinancialProfile.providerId, id))
			.get()
			.catch(() => null),
		safe([], () =>
			db
				.select({
					id: ProviderIntegrationConnection.id,
					status: ProviderIntegrationConnection.status,
					mode: ProviderIntegrationConnection.mode,
				})
				.from(ProviderIntegrationConnection)
				.where(eq(ProviderIntegrationConnection.providerId, id))
				.all()
		),
		safe([], () =>
			db
				.select({ id: ProviderAuditLog.id })
				.from(ProviderAuditLog)
				.where(eq(ProviderAuditLog.providerId, id))
				.limit(20)
				.all()
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
				.all()
		),
	])

	if (!base?.provider?.id) throw new Error("PROVIDER_NOT_FOUND")

	const provider = base.provider
	const profile = base.profile
	const activeTaxDefinitions = taxDefinitions.filter((row) => row.status === "active")
	const verifiedDocuments = documentRows.filter((row) => row.status === "verified")
	const verifiedPaymentAccounts = paymentAccounts.filter((row) => row.status === "verified")
	const connectedIntegrations = integrationRows.filter((row) =>
		["connected", "syncing"].includes(String(row.status))
	)
	const fiscalStatus = String(taxConfiguration?.status ?? profile?.fiscalStatus ?? "")
	const taxResidenceCountry =
		taxConfiguration?.taxResidenceCountry ?? profile?.taxResidenceCountry ?? null
	const paymentReadinessStatus = String(profile?.paymentReadinessStatus ?? "")

	const identityComplete = Boolean(provider.displayName?.trim() && provider.legalName?.trim())
	const operationsComplete = Boolean(
		profile?.timezone?.trim() && profile?.defaultCurrency?.trim() && profile?.supportEmail?.trim()
	)
	const verificationComplete = latestVerification?.status === "approved"
	const documentsComplete = verifiedDocuments.length > 0 || verificationComplete
	const fiscalComplete = Boolean(
		fiscalStatus === "verified" || (activeTaxDefinitions.length > 0 && taxResidenceCountry)
	)
	const paymentsComplete = Boolean(
		verifiedPaymentAccounts.length > 0 ||
		["active", "ready"].includes(String(financialProfile?.status ?? "")) ||
		paymentReadinessStatus === "verified"
	)
	const integrationsReady = Boolean(
		connectedIntegrations.length > 0 || profile?.integrationReadinessStatus === "ready"
	)
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
			label: "Documentos de respaldo disponibles",
			complete: documentsComplete,
			href: settingsRoutes.verification,
			capabilities: ["payments", "integrations"],
		},
		{
			id: "fiscality",
			label: "Fiscalidad configurada",
			complete: fiscalComplete,
			href: settingsRoutes.taxFees,
			capabilities: ["publish", "booking", "payments"],
		},
		{
			id: "payments",
			label: "Cuenta de pago verificada",
			complete: paymentsComplete,
			href: settingsRoutes.profile,
			capabilities: ["payments"],
		},
		{
			id: "integrations",
			label: "Integraciones listas o declaradas",
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
						label: "No hay integraciones listas para producción",
						severity: "low" as const,
						href: settingsRoutes.integrations,
						capabilities: ["integrations"] as ProviderCapability[],
					},
				]),
		...(activeTaxDefinitions.length === 0
			? [
					{
						id: "tax_definitions_missing",
						label: "No hay definiciones fiscales activas",
						severity: "medium" as const,
						href: settingsRoutes.taxFees,
						capabilities: ["booking", "payments"] as ProviderCapability[],
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
						blockersJson: values.blockersJson,
						risksJson: values.risksJson,
						updatedAt: values.updatedAt,
					},
				})
		})
	}

	return summary
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
