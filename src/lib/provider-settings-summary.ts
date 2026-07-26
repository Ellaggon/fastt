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
	buildProviderInvitationAcceptPath,
	ensureProviderInvitationToken,
} from "@/lib/provider-invitations"
import {
	buildProviderRolePermissionMatrix,
	formatProviderRoleLabel,
	resolveProviderPermissions,
} from "@/lib/provider-permissions"
import { resolveTrustAlignedHubCoach } from "@/lib/provider-trust-map"
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
	scope?: "full" | "hub"
}) {
	const { providerId, userId, timing, scope = "full" } = params
	return readThrough(
		`${cacheKeys.providerSettingsSummary(providerId, userId)}:${scope}`,
		cacheTtls.providerSettingsSummary,
		() => buildProviderSettingsSummaryUncached({ providerId, userId, timing, scope })
	)
}

async function buildProviderSettingsSummaryUncached(params: {
	providerId: string
	userId: string
	timing?: ServerTimingRecorder
	scope?: "full" | "hub"
}) {
	const { providerId, userId, timing, scope = "full" } = params
	const includeDiagnostics = scope === "full"
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
		includeDiagnostics
			? measured(timing, "audit", () =>
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
				).catch(() => [])
			: [],
		includeDiagnostics
			? measured(timing, "team", () =>
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
				).catch(() => [])
			: [],
		includeDiagnostics
			? measured(timing, "invitations", () =>
					db
						.select({
							id: ProviderInvitation.id,
							email: ProviderInvitation.email,
							role: ProviderInvitation.role,
							status: ProviderInvitation.status,
							token: ProviderInvitation.token,
							invitedBy: ProviderInvitation.invitedBy,
							acceptedAt: ProviderInvitation.acceptedAt,
							expiresAt: ProviderInvitation.expiresAt,
							createdAt: ProviderInvitation.createdAt,
						})
						.from(ProviderInvitation)
						.where(eq(ProviderInvitation.providerId, providerId))
						.orderBy(desc(ProviderInvitation.createdAt))
				).catch(() => [])
			: [],
		includeDiagnostics
			? measured(timing, "documents", () => listProviderDocuments(providerId)).catch(() => [])
			: [],
		includeDiagnostics
			? measured(timing, "taxConfiguration", () => getProviderTaxConfiguration(providerId)).catch(
					() => null
				)
			: null,
	])

	const taxFeeDefinitions = taxFeeResult.definitions ?? []
	const taxFeeWarnings = buildTaxFeeWarnings(taxFeeDefinitions)
	const blockingMatrix = includeDiagnostics ? buildBlockingMatrix(governance) : []
	const publicationSimulation = includeDiagnostics
		? buildPublicationSimulation({
				governance,
				taxFeeDefinitions,
				taxFeeWarnings,
			})
		: null

	const risks = [
		...governance.risks,
		...(taxFeeWarnings.length
			? [
					{
						id: "tax_fee_warnings",
						label: "Hay advertencias en impuestos o cargos",
						severity: "medium",
						href: routes.providerSettingsTaxFees(),
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
		actions: (() => {
			const coach = resolveTrustAlignedHubCoach(governance.blockers[0] ?? null)
			return {
				primaryCtaLabel: coach?.ctaLabel ?? "Ir al panel",
				primaryCtaAction: coach?.href ?? routes.dashboard(),
				secondaryCtaLabel: governance.blockers[0]
					? "Ver todas las áreas"
					: "Revisar estado de áreas",
				secondaryCtaAction: "#estado-cuenta",
				coachLabel: coach?.label ?? null,
				coachBody: coach?.body ?? null,
			}
		})(),
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
		invitations: await Promise.all(
			invitations.map(async (invitation) => {
				const token =
					invitation.status === "pending" && !invitation.token
						? await ensureProviderInvitationToken(invitation.id).catch(() => null)
						: invitation.token
				return {
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
					acceptPath: token ? buildProviderInvitationAcceptPath(token) : null,
				}
			})
		),
		documents,
		taxConfiguration,
	}
}

export type ProviderSettingsSummary = Awaited<ReturnType<typeof buildProviderSettingsSummary>>
