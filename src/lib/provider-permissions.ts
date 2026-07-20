export type ProviderRole = "owner" | "admin" | "staff"

export type ProviderPermissionKey =
	| "canEditProfile"
	| "canManageFiscality"
	| "canManagePayments"
	| "canManageIntegrations"
	| "canInviteTeam"

export type ProviderPermissions = Record<ProviderPermissionKey, boolean>

export const providerPermissionLabels: Record<ProviderPermissionKey, string> = {
	canEditProfile: "Editar perfil",
	canManageFiscality: "Fiscalidad",
	canManagePayments: "Pagos",
	canManageIntegrations: "Integraciones",
	canInviteTeam: "Equipo",
}

const basePermissionsByRole: Record<ProviderRole, ProviderPermissions> = {
	owner: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canInviteTeam: true,
	},
	admin: {
		canEditProfile: true,
		canManageFiscality: true,
		canManagePayments: true,
		canManageIntegrations: true,
		canInviteTeam: false,
	},
	staff: {
		canEditProfile: false,
		canManageFiscality: false,
		canManagePayments: false,
		canManageIntegrations: false,
		canInviteTeam: false,
	},
}

function normalizeRole(role: unknown): ProviderRole {
	if (role === "owner" || role === "admin" || role === "staff") return role
	return "staff"
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
	return [
		{ role: "owner", label: "Propietario" },
		{ role: "admin", label: "Administrador" },
		{ role: "staff", label: "Operación" },
	].map((item) => ({
		...item,
		...resolveProviderPermissions({ role: item.role }),
	}))
}
