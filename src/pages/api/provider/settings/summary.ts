import type { APIRoute } from "astro"
import { db, desc, eq, ProviderAuditLog, ProviderInvitation, ProviderUser, User } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ensureLocalFinancialDemoSeed } from "@/lib/dev/ensureLocalFinancialDemoSeed"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { listProviderDocuments } from "@/lib/provider-documents"
import { getProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import { getProviderFullAggregate } from "@/modules/catalog/public"
import { listTaxFeeDefinitionsByProviderUseCase } from "@/container/taxes-fees.container"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"
import { routes } from "@/lib/routes"
import {
	buildProviderRolePermissionMatrix,
	resolveProviderPermissions,
} from "@/lib/provider-permissions"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

const capabilityLabels = {
	publish: "Publicación",
	booking: "Reservas",
	payments: "Cobros",
	integrations: "Integraciones",
}

const rolePermissions = buildProviderRolePermissionMatrix()

function buildBlockingMatrix(governance: Awaited<ReturnType<typeof evaluateProviderGovernance>>) {
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
	governance: Awaited<ReturnType<typeof evaluateProviderGovernance>>
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

export const GET: APIRoute = async ({ request }) => {
	await ensureLocalFinancialDemoSeed()

	const user = await getUserFromRequest(request)
	if (!user?.id) return json({ error: "Unauthorized" }, 401)

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) return json({ error: "Provider not found" }, 404)

	const aggregate = await getProviderFullAggregate(providerId, user.id)
	if (!aggregate) return json({ error: "Provider not found" }, 404)

	const provider = aggregate.provider
	const profile = aggregate.profile
	const latestVerification = aggregate.latestVerification
	const ownerUser = aggregate.ownerUser
	const governance = await evaluateProviderGovernance(providerId, {
		currentUserId: user.id,
		persist: true,
	})
	const taxFeeResult = await listTaxFeeDefinitionsByProviderUseCase({ providerId }).catch(() => ({
		definitions: [],
	}))
	const taxFeeDefinitions = taxFeeResult.definitions ?? []
	const taxFeeWarnings = buildTaxFeeWarnings(taxFeeDefinitions)
	const blockingMatrix = buildBlockingMatrix(governance)
	const publicationSimulation = buildPublicationSimulation({
		governance,
		taxFeeDefinitions,
		taxFeeWarnings,
	})
	const auditEvents = await db
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
		.all()
		.catch(() => [])
	const teamUsers = await db
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
		.all()
		.catch(() => [])
	const invitations = await db
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
		.all()
		.catch(() => [])
	const documents = await listProviderDocuments(providerId).catch(() => [])
	const taxConfiguration = await getProviderTaxConfiguration(providerId).catch(() => null)

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

	return json({
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
							permissions: resolveProviderPermissions({ role: "owner" }),
							permissionsJson: null,
						},
					]
				: [],
		invitations: invitations.map((invitation) => ({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			invitedBy: invitation.invitedBy,
			acceptedAt: invitation.acceptedAt,
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
		})),
		documents,
		taxConfiguration,
	})
}
