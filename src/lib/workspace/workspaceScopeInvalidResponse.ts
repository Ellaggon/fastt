import type { WorkspaceScopeInvalid } from "@/lib/workspace/resolveWorkspaceScope"

const messages: Record<WorkspaceScopeInvalid["reason"], string> = {
	scope_product_mismatch: "El negocio seleccionado no coincide con esta experiencia.",
	scope_unavailable: "Este negocio no forma parte de las líneas habilitadas para esta cuenta.",
	unsupported_scope: "El filtro de negocio no es válido.",
}

export function workspaceScopeInvalidResponse(
	resolution: WorkspaceScopeInvalid,
	input: { title: string; recoveryHref: string; recoveryLabel: string }
): Response {
	const message = messages[resolution.reason]
	return new Response(
		`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title><main style="font-family:system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:2rem;color:#0f172a"><h1>Revisa el negocio seleccionado</h1><p>${message}</p><a href="${input.recoveryHref}">${input.recoveryLabel}</a></main></html>`,
		{ status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
	)
}
