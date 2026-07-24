import { listTaxFeeDefinitionsByProviderUseCase } from "@/container/taxes-fees.container"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import { ensureLocalFinancialDemoSeed } from "@/lib/dev/ensureLocalFinancialDemoSeed"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"
import {
	evaluateProviderGovernance,
	readProviderGovernanceFromConfigurationState,
} from "@/lib/provider-governance"
import { listProviderDocuments } from "@/lib/provider-documents"
import { getProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import {
	buildProviderRolePermissionMatrix,
	formatProviderRoleLabel,
	resolveProviderPermissions,
} from "@/lib/provider-permissions"
import { routes } from "@/lib/routes"
import { getProviderFullAggregate } from "@/modules/catalog/public"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"
import {
	db,
	desc,
	eq,
	ProviderAuditLog,
	ProviderInvitation,
	ProviderUser,
	User,
} from "@/shared/infrastructure/db/compat"

const capabilityLabels = {
	publish: "Publicación",
	booking: "Reservas",
	payments: "Cobros",
	integrations: "Integraciones",
}

const rolePermissions = buildProviderRolePermissionMatrix()

type ProviderGovernance = Awaited<ReturnType<typeof evaluateProviderGovernance>>

function buildBlockingMatrix(governance: ProviderGovernance) {
	return (Object.keys(capabilityLabels) as Array<keyof typeof capabilityLabels>).map(
		(capability) => {
			const blockers = governance.blockers.filter((blocker) =>
				blocker.capabilities.includes(capability)
			)
			const risks = governance.risks.filter((risk) => risk.capabilities.includes(capability))
			return {
				id: capability,
				label: capabilityLabels[capability],
				enabled: governance.capabilities[capability],
				blockers,
				risks,
				message: governance.capabilities[capability]
					? `${capabilityLabels[capability]} habilitada.`
					: blockers.length
						? `${blockers.length} bloqueo${blockers.length === 1 ? "" : "s"} impide${blockers.length === 1 ? "" : "n"} activar ${capabilityLabels[capability].toLowerCase()}.`
						: `${capabilityLabels[capability]} requiere revisión antes de operar.`,
			}
		}
	)
}

function buildPublicationSimulation(params: {
	governance: ProviderGovernance
	taxFeeDefinitions: unknown[]
	taxFeeWarnings: unknown[]
}) {
	const fiscalReady =
		params.governance.readiness.find((item) => item.id === "fiscality")?.complete ?? false
	const paymentsReady =
		params.governance.readiness.find((item) => item.id === "payments")?.complete ?? false
	const taxDefinitionCount = params.taxFeeDefinitions.length
	const warningsCount = params.taxFeeWarnings.length
	const baseAmount = 100
	const estimatedTax = fiscalReady && taxDefinitionCount > 0 ? 13 : 0
	const estimatedPayout = paymentsReady ? baseAmount + estimatedTax : 0
	const blockers = [
		...params.governance.blockers.filter((blocker) =>
			blocker.capabilities.some((capability) => ["publish", "payments"].includes(capability))
		),
	]
	return {
		baseAmount,
		estimatedTax,
		estimatedPayout,
		currency: "USD",
		canPublishSafely:
			params.governance.capabilities.publish && params.governance.capabilities.payments,
		fiscalReady,
		paymentsReady,
		taxDefinitionCount,
		warningsCount,
		blockers,
		message:
			blockers.length > 0
				? "La simulación detecta bloqueos antes de publicar."
				: warningsCount > 0
					? "Puede publicarse, pero conviene revisar advertencias fiscales."
					: "Simulación fiscal y de pagos lista para publicar.",
	}
}

async function measured<TValue>(
	timing: ServerTimingRecorder | undefined,
	name: string,
	fn: () => Promise<TValue>
): Promise<TValue> {
	return timing ? timing.time(name, fn) : fn()
}

async function getProviderGovernanceSummary(params: {
	providerId: string
	userId: string
	timing?: ServerTimingRecorder
}) {
	return measured(params.timing, "governance", () =>
		readThrough(
			cacheKeys.providerGovernanceSummary(params.providerId, params.userId),
			cacheTtls.providerGovernanceSummary,
			async () =>
				(await readProviderGovernanceFromConfigurationState(params.providerId, {
					currentUserId: params.userId,
				})) ??
				evaluateProviderGovernance(params.providerId, {
					currentUserId: params.userId,
					persist: true,
				})
		)
	)
}

export async function buildProviderSettingsSummary(params: {
	providerId: string
	userId: string
	timing?: ServerTimingRecorder
}) {
	const { providerId, userId, timing } = params
	return readThrough(
		cacheKeys.providerSettingsSummary(providerId, userId),
		cacheTtls.providerSettingsSummary,
		() => buildProviderSettingsSummaryUncached({ providerId, userId, timing })
	)
}

async function buildProviderSettingsSummaryUncached(params: {
	providerId: string
	userId: string
	timing?: ServerTimingRecorder
}) {
	const { providerId, userId, timing } = params
	await measured(timing, "devSeed", () => ensureLocalFinancialDemoSeed())

	const aggregate = await measured(timing, "providerAggregate", () =>
		getProviderFullAggregate(providerId, userId)
	)
	if (!aggregate) return null

	const provider = aggregate.provider
	const profile = aggregate.profile
	const latestVerification = aggregate.latestVerification
	const ownerUser = aggregate.ownerUser
	const [
		governance,
		taxFeeResult,
		auditEvents,
		teamUsers,
		invitations,
		documents,
		taxConfiguration,
	] = await Promise.all([
		getProviderGovernanceSummary({ providerId, userId, timing }),
		measured(timing, "tax", () => listTaxFeeDefinitionsByProviderUseCase({ providerId })).catch(
			() => ({
				definitions: [],
			})
		),
		measured(timing, "audit", () =>
			db
				.select({
					id: ProviderAuditLog.id,
					action: ProviderAuditLog.action,
					entityType: ProviderAuditLog.entityType,
					entityId: ProviderAuditLog.entityId,
					riskLevel: ProviderAuditLog.riskLevel,
					createdAt: ProviderAuditLog.createdAt,
					actorEmail: User.email,
				})
				.from(ProviderAuditLog)
				.leftJoin(User, eq(User.id, ProviderAuditLog.actorUserId))
				.where(eq(ProviderAuditLog.providerId, providerId))
				.orderBy(desc(ProviderAuditLog.createdAt))
				.limit(8)
		).catch(() => []),
		measured(timing, "team", () =>
			db
				.select({
					id: User.id,
					email: User.email,
					role: ProviderUser.role,
					permissionsJson: ProviderUser.permissionsJson,
					createdAt: ProviderUser.createdAt,
				})
				.from(ProviderUser)
				.leftJoin(User, eq(User.id, ProviderUser.userId))
				.where(eq(ProviderUser.providerId, providerId))
		).catch(() => []),
		measured(timing, "invitations", () =>
			db
				.select({
					id: ProviderInvitation.id,
					email: ProviderInvitation.email,
					role: ProviderInvitation.role,
					status: ProviderInvitation.status,
					invitedBy: ProviderInvitation.invitedBy,
					acceptedAt: ProviderInvitation.acceptedAt,
					expiresAt: ProviderInvitation.expiresAt,
					createdAt: ProviderInvitation.createdAt,
				})
				.from(ProviderInvitation)
				.where(eq(ProviderInvitation.providerId, providerId))
				.orderBy(desc(ProviderInvitation.createdAt))
		).catch(() => []),
		measured(timing, "documents", () => listProviderDocuments(providerId)).catch(() => []),
		measured(timing, "taxConfiguration", () => getProviderTaxConfiguration(providerId)).catch(
			() => null
		),
	])

	const taxFeeDefinitions = taxFeeResult.definitions ?? []
	const taxFeeWarnings = buildTaxFeeWarnings(taxFeeDefinitions)
	const blockingMatrix = buildBlockingMatrix(governance)
	const publicationSimulation = buildPublicationSimulation({
		governance,
		taxFeeDefinitions,
		taxFeeWarnings,
	})

	const risks = [
		...governance.risks,
		...(taxFeeWarnings.length
			? [
					{
						id: "tax_fee_warnings",
						label: "Hay advertencias en impuestos o cargos",
						severity: "medium",
						href: routes.providerSettingsTaxSales(),
					},
				]
			: []),
	]

	return {
		provider: {
			id: provider.id,
			displayName: provider.displayName || provider.legalName || "Proveedor",
			legalName: provider.legalName || "",
			status: provider.status ?? "draft",
		},
		profile: {
			timezone: profile?.timezone || "",
			defaultCurrency: profile?.defaultCurrency || "",
			supportEmail: profile?.supportEmail || "",
			supportPhone: profile?.supportPhone || "",
		},
		verification: {
			status: latestVerification?.status ?? "pending",
			reason: latestVerification?.reason ?? "Sin motivo informado",
		},
		permissions: governance.permissions,
		capabilities: governance.capabilities,
		readiness: governance.readiness,
		blockingMatrix,
		blockers: governance.blockers,
		risks,
		auditEvents,
		rolePermissions,
		publicationSimulation,
		counts: governance.counts,
		progress: {
			completed: governance.progress.completed,
			total: governance.progress.total,
			progressPercent: governance.progress.progressPercent,
			message:
				governance.blockers.length > 0
					? `${governance.blockers.length} bloqueo${governance.blockers.length === 1 ? "" : "s"} pendiente${governance.blockers.length === 1 ? "" : "s"}.`
					: "Configuración base lista.",
		},
		actions: {
			primaryCtaLabel: governance.blockers[0]?.label
				? `Resolver ${governance.blockers[0].label}`
				: "Ir al panel",
			primaryCtaAction: governance.blockers[0]?.href ?? routes.dashboard(),
		},
		users: teamUsers.length
			? teamUsers.map((user) => ({
					id: user.id,
					email: user.email,
					role: user.role,
					roleLabel: formatProviderRoleLabel(user.role),
					permissions: resolveProviderPermissions({
						role: user.role,
						permissionsJson: user.permissionsJson,
					}),
					permissionsJson: user.permissionsJson,
					createdAt: user.createdAt,
				}))
			: ownerUser
				? [
						{
							id: ownerUser.id,
							email: ownerUser.email,
							role: "owner",
							roleLabel: formatProviderRoleLabel("owner"),
							permissions: resolveProviderPermissions({ role: "owner" }),
							permissionsJson: null,
						},
					]
				: [],
		invitations: invitations.map((invitation) => ({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			roleLabel: formatProviderRoleLabel(invitation.role),
			status: invitation.status,
			statusLabel:
				invitation.status === "pending"
					? "Pendiente de aceptación"
					: invitation.status === "accepted"
						? "Aceptada"
						: invitation.status === "canceled"
							? "Cancelada"
							: invitation.status === "expired"
								? "Expirada"
								: String(invitation.status),
			invitedBy: invitation.invitedBy,
			acceptedAt: invitation.acceptedAt,
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
		})),
		documents,
		taxConfiguration,
	}
}

export type ProviderSettingsSummary = Awaited<ReturnType<typeof buildProviderSettingsSummary>>
