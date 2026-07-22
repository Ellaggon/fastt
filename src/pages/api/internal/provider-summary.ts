import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ensureLocalFinancialDemoSeed } from "@/lib/dev/ensureLocalFinancialDemoSeed"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { routes } from "@/lib/routes"
import { getProviderFullAggregate } from "@/modules/catalog/public"

/**
 * Legacy dashboard summary. Progress MUST match evaluateProviderGovernance (8 checks),
 * not the old 3-step identity/ops/verification shortcut.
 */
export const GET: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const endpointName = "provider-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	await ensureLocalFinancialDemoSeed()

	const user = await getUserFromRequest(request)
	if (!user?.id) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const aggregate = await getProviderFullAggregate(providerId, user.id)
	if (!aggregate) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const governance = await evaluateProviderGovernance(providerId, {
		currentUserId: user.id,
		persist: true,
	})

	const provider = aggregate.provider
	const profile = aggregate.profile
	const latestVerification = aggregate.latestVerification
	const ownerUser = aggregate.ownerUser

	const status = String(provider.status ?? "draft")
		.trim()
		.toLowerCase()

	const readinessById = Object.fromEntries(
		governance.readiness.map((item) => [item.id, item.complete])
	)
	const identityComplete = Boolean(readinessById.identity)
	const operationalComplete = Boolean(readinessById.operations)
	const verificationComplete = Boolean(readinessById.verification)
	const documentsComplete = Boolean(readinessById.documents)
	const fiscalComplete = Boolean(readinessById.fiscality)
	const paymentsComplete = Boolean(readinessById.payments)

	const requiredMissingCount = governance.blockers.length
	const derivedState =
		status === "active"
			? "active"
			: status === "draft"
				? "draft"
				: requiredMissingCount > 0
					? "setup_incomplete"
					: "ready"

	const completedSteps = governance.progress.completed
	const totalSteps = governance.progress.total
	const remainingSteps = Math.max(0, totalSteps - completedSteps)
	const progressPercent = governance.progress.progressPercent
	const progressMessage =
		derivedState === "active"
			? "Su cuenta de proveedor está activa."
			: remainingSteps > 0
				? `${remainingSteps} paso${remainingSteps === 1 ? "" : "s"} de gobernanza pendiente${remainingSteps === 1 ? "" : "s"}.`
				: "Todos los checks de gobernanza están completos."

	const stateLabel =
		derivedState === "active"
			? "Activa"
			: derivedState === "ready"
				? "Lista"
				: derivedState === "setup_incomplete"
					? "Configuración incompleta"
					: "Borrador"
	const badgeVariant =
		derivedState === "active"
			? "success"
			: derivedState === "ready"
				? "info"
				: derivedState === "setup_incomplete"
					? "warning"
					: "neutral"

	const primaryBlocker = governance.blockers[0]
	const primaryCtaAction = primaryBlocker?.href ?? routes.dashboard()
	const primaryCtaLabel = primaryBlocker
		? `Resolver: ${primaryBlocker.label}`
		: derivedState === "active"
			? "Cuenta activa"
			: "Ir al panel"

	const users = ownerUser ? [{ id: ownerUser.id, email: ownerUser.email, role: "owner" }] : []

	logEndpoint()
	return new Response(
		JSON.stringify({
			provider: {
				id: provider.id,
				displayName: provider.displayName || provider.legalName || "Proveedor",
				legalName: provider.legalName || "",
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
			ownerEmail: ownerUser?.email || "Sin vincular",
			users,
			// Legacy 3-key shape kept for older clients; values now come from governance.
			checks: {
				identityComplete,
				operationalComplete,
				verificationComplete,
				documentsComplete,
				fiscalComplete,
				paymentsComplete,
			},
			capabilities: governance.capabilities,
			readiness: governance.readiness,
			blockers: governance.blockers,
			risks: governance.risks,
			progress: {
				completedSteps,
				totalSteps,
				remainingSteps,
				progressPercent,
				progressMessage,
			},
			state: {
				derivedState,
				stateLabel,
				badgeVariant,
			},
			actions: {
				primaryCtaAction,
				primaryCtaLabel,
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
