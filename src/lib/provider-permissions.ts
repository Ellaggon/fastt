export type ProviderRole = "owner" | "admin" | "staff"

export type ProviderPermissionKey =
	| "canEditProfile"
	| "canManageFiscality"
	| "canManagePayments"
	| "canManageIntegrations"
	| "canManageDocuments"
	| "canInviteTeam"

export type ProviderPermissions = Record<ProviderPermissionKey, boolean>

export const providerPermissionLabels: Record<ProviderPermissionKey, string> = {
	canEditProfile: "Editar perfil",
	canManageFiscality: "Fiscalidad",
	canManagePayments: "Pagos",
	canManageIntegrations: "Integraciones",
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
		description: "La persona recibe (o usará) la invitación pendiente.",
	},
	{
		id: "accept",
		label: "Aceptar",
		description: "Al unirse, el rol queda activo en el proveedor.",
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
	const isTerminal = status === "canceled" || status === "expired"
	const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null
	const isExpired = !isAccepted && Boolean(expiresAt) && expiresAt.getTime() < Date.now()

	const activeStepId: ProviderInviteLifecycleStepId = isAccepted ? "access" : "email"
	const activeIndex = inviteLifecycleStepOrder.indexOf(activeStepId)

	const steps: ProviderInviteLifecycleStep[] = providerInviteLifecycleSteps.map((step) => {
		if (isAccepted) return { ...step, state: "complete" as const }
		const index = inviteLifecycleStepOrder.indexOf(step.id)
		let state: ProviderInviteLifecycleStepState
		if (index < activeIndex) state = "complete"
		else if (index === activeIndex) state = isExpired ? "blocked" : "current"
		else state = "upcoming"
		return { ...step, state }
	})

	const phaseLabel = isAccepted
		? "Aceptada"
		: isExpired
			? "Expirada"
			: isTerminal
				? "Cancelada"
				: "Pendiente"

	return {
		steps,
		currentStepId: isTerminal ? null : activeStepId,
		isExpired,
		canResend: !isAccepted && !isTerminal,
		phaseLabel,
	}
}

const basePermissionsByRole: Record<ProviderRole, ProviderPermissions> = {
	owner: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canManageDocuments: true,
		canInviteTeam: true,
	},
	admin: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canManageDocuments: true,
		canInviteTeam: false,
	},
	staff: {
		canEditProfile: false,
		canManageFiscality: false,
		canManagePayments: false,
		canManageIntegrations: false,
		canManageDocuments: false,
		canInviteTeam: false,
	},
}

function normalizeRole(role: unknown): ProviderRole {
	if (role === "owner" || role === "admin" || role === "staff") return role
	return "staff"
}

export function formatProviderRoleLabel(role: unknown): string {
	return providerRoleLabels[normalizeRole(role)]
}

export function formatProviderRoleDescription(role: unknown): string {
	return providerRoleDescriptions[normalizeRole(role)]
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
	const role = normalizeRole(params.role)
	return {
		...basePermissionsByRole[role],
		...normalizeOverrides(params.permissionsJson),
	}
}

export function buildProviderRolePermissionMatrix() {
	return (["owner", "admin", "staff"] as const).map((role) => ({
		role,
		label: providerRoleLabels[role],
		description: providerRoleDescriptions[role],
		...resolveProviderPermissions({ role }),
	}))
}
