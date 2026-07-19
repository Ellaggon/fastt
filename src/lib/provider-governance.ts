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

	const identityComplete = Boolean(provider.displayName?.trim() && provider.legalName?.trim())
	const operationsComplete = Boolean(
		profile?.timezone?.trim() && profile?.defaultCurrency?.trim() && profile?.supportEmail?.trim()
	)
	const verificationComplete = latestVerification?.status === "approved"
	const documentsComplete = verifiedDocuments.length > 0 || verificationComplete
	const fiscalComplete = Boolean(
		profile?.fiscalStatus === "verified" ||
		taxConfiguration?.status === "verified" ||
		(activeTaxDefinitions.length > 0 &&
			(profile?.taxResidenceCountry || taxConfiguration?.taxResidenceCountry))
	)
	const paymentsComplete = Boolean(
		profile?.paymentReadinessStatus === "verified" ||
		verifiedPaymentAccounts.length > 0 ||
		financialProfile?.status === "active"
	)
	const integrationsReady = Boolean(
		profile?.integrationReadinessStatus === "ready" || connectedIntegrations.length > 0
	)
	const teamComplete = teamRows.some((row) => ["owner", "admin"].includes(String(row.role)))
	const currentUserRole = opts.currentUserId
		? teamRows.find((row) => row.userId === opts.currentUserId)?.role
		: null
	const canAdminister = ["owner", "admin"].includes(String(currentUserRole ?? ""))
	const isOwner = currentUserRole === "owner"

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
		permissions: {
			canEditProfile: canAdminister,
			canManageFiscality: canAdminister,
			canManagePayments: canAdminister,
			canManageIntegrations: canAdminister,
			canInviteTeam: isOwner,
		},
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
			const existing = await db
				.select({ providerId: ProviderConfigurationState.providerId })
				.from(ProviderConfigurationState)
				.where(eq(ProviderConfigurationState.providerId, id))
				.get()
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
			if (existing) {
				await db
					.update(ProviderConfigurationState)
					.set(values)
					.where(eq(ProviderConfigurationState.providerId, id))
				return
			}
			await db.insert(ProviderConfigurationState).values(values)
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
	if (!summary.capabilities[params.capability]) {
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
