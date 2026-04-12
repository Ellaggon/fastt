import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderFullAggregate } from "@/modules/catalog/public"

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

	const provider = aggregate.provider
	const profile = aggregate.profile
	const latestVerification = aggregate.latestVerification
	const ownerUser = aggregate.ownerUser

	const status = String(provider.status ?? "draft")
		.trim()
		.toLowerCase()

	const isMissingLegalName = !provider.legalName?.trim()
	const isMissingTimezone = !profile?.timezone?.trim()
	const isMissingCurrency = !profile?.defaultCurrency?.trim()
	const isMissingContactOrSupport = !profile?.supportEmail?.trim()
	const requiredMissingCount = [
		isMissingLegalName,
		isMissingTimezone,
		isMissingCurrency,
		isMissingContactOrSupport,
	].filter(Boolean).length

	const derivedState =
		status === "active"
			? "active"
			: status === "draft"
				? "draft"
				: requiredMissingCount > 0
					? "setup_incomplete"
					: "ready"

	const identityComplete = Boolean(provider.displayName?.trim() && provider.legalName?.trim())
	const operationalComplete = Boolean(
		profile?.timezone?.trim() && profile?.defaultCurrency?.trim() && profile?.supportEmail?.trim()
	)
	const verificationComplete = latestVerification?.status === "approved"
	const completedSteps = [identityComplete, operationalComplete, verificationComplete].filter(
		Boolean
	).length
	const totalSteps = 3
	const remainingSteps = totalSteps - completedSteps
	const progressPercent = Math.round((completedSteps / totalSteps) * 100)
	const progressMessage =
		derivedState === "active"
			? "Su cuenta de proveedor está activa."
			: remainingSteps > 0
				? `${remainingSteps} paso${remainingSteps === 1 ? "" : "s"} obligatorio${remainingSteps === 1 ? "" : "s"} pendiente${remainingSteps === 1 ? "" : "s"}.`
				: "Todos los pasos obligatorios están completos."

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

	const primaryCtaAction = !identityComplete
		? "/provider?step=register"
		: !operationalComplete
			? "/provider?step=profile"
			: !verificationComplete
				? "/provider?step=verification"
				: "/dashboard"

	const primaryCtaLabel =
		primaryCtaAction === "/dashboard"
			? "Ir al panel"
			: primaryCtaAction === "/provider?step=register"
				? "Completar identidad"
				: primaryCtaAction === "/provider?step=profile"
					? "Completar perfil"
					: "Ver detalles"

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
			checks: {
				identityComplete,
				operationalComplete,
				verificationComplete,
			},
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
