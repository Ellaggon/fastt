export type ProviderRole = "owner" | "admin" | "staff"

export type ProviderPermissionKey =
	| "canEditProfile"
	| "canManageFiscality"
	| "canManagePayments"
	| "canManageIntegrations"
	| "canRunIntegrationCertification"
	| "canManageDocuments"
	| "canInviteTeam"

export type ProviderPermissions = Record<ProviderPermissionKey, boolean>

export const providerPermissionLabels: Record<ProviderPermissionKey, string> = {
	canEditProfile: "Editar perfil",
	canManageFiscality: "Fiscalidad",
	canManagePayments: "Pagos",
	canManageIntegrations: "Integraciones",
	canRunIntegrationCertification: "Certificación de integraciones",
	canManageDocuments: "Documentos",
	canInviteTeam: "Equipo",
}

/** Human-facing role labels (never show admin/staff raw keys in provider UI). */
export const providerRoleLabels: Record<ProviderRole, string> = {
	owner: "Propietario",
	admin: "Administrador",
	staff: "Operaciones",
}

export const providerRoleDescriptions: Record<ProviderRole, string> = {
	owner: "Control total del proveedor, incluido invitar al equipo.",
	admin: "Puede gestionar perfil, fiscalidad, pagos, integraciones y documentos.",
	staff: "Acceso operativo limitado; no cambia configuración sensible.",
}

export const providerInviteLifecycleSteps = [
	{
		id: "invite",
		label: "Invitar",
		description: "Eliges correo y rol.",
	},
	{
		id: "email",
		label: "Correo",
		description:
			"Si el correo está configurado, Fastt lo envía; también puedes compartir el enlace.",
	},
	{
		id: "accept",
		label: "Aceptar",
		description: "Entra con ese correo y acepta la invitación.",
	},
	{
		id: "access",
		label: "Acceso",
		description: "Opera según la matriz de permisos de su rol.",
	},
] as const

export type ProviderInviteLifecycleStepId = (typeof providerInviteLifecycleSteps)[number]["id"]

export type ProviderInviteLifecycleStepState = "complete" | "current" | "upcoming" | "blocked"

export type ProviderInviteLifecycleStep = {
	id: ProviderInviteLifecycleStepId
	label: string
	description: string
	state: ProviderInviteLifecycleStepState
}

export type ProviderInviteLifecycleProgress = {
	steps: ProviderInviteLifecycleStep[]
	currentStepId: ProviderInviteLifecycleStepId | null
	isExpired: boolean
	canResend: boolean
	phaseLabel: string
}

const inviteLifecycleStepOrder = providerInviteLifecycleSteps.map((step) => step.id)

/**
 * Live progress for a single invitation, driven by real status/expiresAt/acceptedAt
 * (never a static illustrative stepper).
 */
export function buildInviteLifecycleProgress(params: {
	status: unknown
	expiresAt?: Date | string | null
	acceptedAt?: Date | string | null
}): ProviderInviteLifecycleProgress {
	const status = String(params.status ?? "pending")
	const isAccepted = status === "accepted"
	const isCanceled = status === "canceled"
	const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null
	const isExpired =
		!isAccepted &&
		(status === "expired" || (expiresAt !== null && expiresAt.getTime() < Date.now()))

	// Pending invite with shareable link: invite+email done, waiting on accept.
	const activeStepId: ProviderInviteLifecycleStepId = isAccepted ? "access" : "accept"
	const activeIndex = inviteLifecycleStepOrder.indexOf(activeStepId)

	const steps: ProviderInviteLifecycleStep[] = providerInviteLifecycleSteps.map((step) => {
		if (isAccepted) return { ...step, state: "complete" as const }
		const index = inviteLifecycleStepOrder.indexOf(step.id)
		let state: ProviderInviteLifecycleStepState
		if (index < activeIndex) state = "complete"
		else if (index === activeIndex) state = isExpired || isCanceled ? "blocked" : "current"
		else state = "upcoming"
		return { ...step, state }
	})

	const phaseLabel = isAccepted
		? "Aceptada"
		: isExpired
			? "Expirada"
			: isCanceled
				? "Cancelada"
				: "Pendiente"

	return {
		steps,
		currentStepId: isCanceled || isExpired ? null : activeStepId,
		isExpired,
		canResend: !isAccepted && !isCanceled,
		phaseLabel,
	}
}

const basePermissionsByRole: Record<ProviderRole, ProviderPermissions> = {
	owner: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canRunIntegrationCertification: false,
		canManageDocuments: true,
		canInviteTeam: true,
	},
	admin: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canRunIntegrationCertification: false,
		canManageDocuments: true,
		canInviteTeam: false,
	},
	staff: {
		canEditProfile: false,
		canManageFiscality: false,
		canManagePayments: false,
		canManageIntegrations: false,
		canRunIntegrationCertification: false,
		canManageDocuments: false,
		canInviteTeam: false,
	},
}

/**
 * Normalize DB/session role strings.
 * Trims + lowercases so "Owner" / "OWNER " do not silently become staff.
 * Empty/unknown still maps to staff (least privilege) — heal paths promote sole members.
 */
export function normalizeProviderRole(role: unknown): ProviderRole {
	const raw = String(role ?? "")
		.trim()
		.toLowerCase()
	if (raw === "owner" || raw === "admin" || raw === "staff") return raw
	return "staff"
}

export function formatProviderRoleLabel(role: unknown): string {
	return providerRoleLabels[normalizeProviderRole(role)]
}

export function formatProviderRoleDescription(role: unknown): string {
	return providerRoleDescriptions[normalizeProviderRole(role)]
}

function normalizeOverrides(value: unknown): Partial<ProviderPermissions> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {}
	const raw = value as Record<string, unknown>
	return Object.keys(providerPermissionLabels).reduce<Partial<ProviderPermissions>>((acc, key) => {
		const permissionKey = key as ProviderPermissionKey
		if (typeof raw[permissionKey] === "boolean") acc[permissionKey] = raw[permissionKey]
		return acc
	}, {})
}

export function resolveProviderPermissions(params: {
	role?: unknown
	permissionsJson?: unknown
}): ProviderPermissions {
	const role = normalizeProviderRole(params.role)
	const merged: ProviderPermissions = {
		...basePermissionsByRole[role],
		...normalizeOverrides(params.permissionsJson),
	}
	// Owner must retain core controls even if permissionsJson was corrupted.
	if (role === "owner") {
		merged.canEditProfile = true
		merged.canManageDocuments = true
		merged.canInviteTeam = true
	}
	return merged
}

/**
 * When a provider has no owner (or a single member stuck as staff), promote that member.
 * Returns the role that should be used after the heal decision (does not write DB by itself).
 */
export function resolveHealedProviderRole(params: {
	currentRole: unknown
	memberRoles: unknown[]
}): { role: ProviderRole; shouldPromoteToOwner: boolean; reason: string | null } {
	const current = normalizeProviderRole(params.currentRole)
	if (current === "owner" || current === "admin") {
		return { role: current, shouldPromoteToOwner: false, reason: null }
	}

	const normalizedMembers = params.memberRoles.map((role) => normalizeProviderRole(role))
	const ownerCount = normalizedMembers.filter((role) => role === "owner").length
	const memberCount = normalizedMembers.length

	if (ownerCount === 0) {
		return {
			role: "owner",
			shouldPromoteToOwner: true,
			reason: "provider_has_no_owner",
		}
	}
	if (memberCount <= 1) {
		return {
			role: "owner",
			shouldPromoteToOwner: true,
			reason: "sole_provider_member",
		}
	}

	return { role: current, shouldPromoteToOwner: false, reason: null }
}

export function buildProviderRolePermissionMatrix() {
	return (["owner", "admin", "staff"] as const).map((role) => ({
		role,
		label: providerRoleLabels[role],
		description: providerRoleDescriptions[role],
		...resolveProviderPermissions({ role }),
	}))
}
