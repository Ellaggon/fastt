/**
 * Host-facing integration error mapping (Simple mode).
 * Never surface vault://, smoke, or raw probe jargon in provider UI.
 */

const exactMessages: Record<string, string> = {
	CONNECTION_NOT_FOUND: "No encontramos esa integración. Guárdala primero y vuelve a intentar.",
	INTEGRATION_CONNECTION_NOT_FOUND: "No encontramos esa conexión o ya no tienes acceso.",
	INTEGRATION_CONNECTION_REVOKED: "Una conexión revocada no puede establecerse como principal.",
	INTEGRATION_MAPPING_NOT_FOUND: "No encontramos ese mapeo o ya fue eliminado.",
	INTEGRATION_INCIDENT_NOT_FOUND: "No encontramos esa incidencia o ya no está disponible.",
	CONNECTOR_NOT_FOUND: "Ese tipo de conector no está disponible.",
	unknown_connector: "Ese tipo de conector no está disponible.",
	unauthorized: "Tu sesión expiró. Vuelve a iniciar sesión.",
	forbidden: "No tienes permiso para gestionar integraciones.",
	INTEGRATION_PERMISSION_DENIED: "No tienes permiso para gestionar integraciones.",
	DISCONNECT_CONFIRMATION_REQUIRED: "Para desconectar, escribe DESCONECTAR y confirma la acción.",
	INTEGRATION_VAULT_KEY_REQUIRED:
		"El entorno no tiene configurada la llave segura de integraciones. Configúrala antes de guardar OAuth.",
	INTEGRATION_VAULT_DECRYPT_FAILED:
		"No pudimos leer la credencial segura. Vuelve a conectar la integración.",
	INTEGRATION_VAULT_PAYLOAD_INVALID:
		"La credencial segura no es válida. Vuelve a conectar la integración.",
	integration_error: "No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.",
	credentials_required: "Falta el enlace o la referencia de conexión.",
	oauth_not_configured:
		"OAuth no está configurado en este entorno. Usa el enlace o referencia manual.",
	oauth_authorize_unavailable:
		"No pudimos abrir la autorización OAuth. Revisa la configuración del entorno.",
	PRODUCTION_BLOCKED:
		"Todavía no puedes usar producción. Completa verificación, pagos y el resto de requisitos del proveedor.",
}

const successPatterns: Array<{ test: RegExp; message: string }> = [
	{
		test: /Smoke HTTPS OK|Smoke harness OK/i,
		message: "Prueba de conexión correcta.",
	},
	{
		test: /Referencia vault válida|Referencia OAuth válida/i,
		message: "Referencia de acceso válida.",
	},
]

const errorPatterns: Array<{ test: RegExp; message: string }> = [
	{
		test: /No hay un endpoint|INTEGRATION_ENDPOINT_INVALID/i,
		message:
			"Falta un enlace https válido o una referencia de acceso guardada. Completa el campo y vuelve a probar.",
	},
	{
		test: /vault:\/\/|oauth2:\/\//i,
		message:
			"La referencia de acceso no es válida. Usa un enlace https o una referencia segura correcta.",
	},
	{
		test: /Smoke HTTPS falló|HTTP 5\d\d/i,
		message: "El servicio respondió con un error. Revisa el enlace o intenta más tarde.",
	},
	{
		test: /Smoke HTTPS no alcanzó|AbortError|aborted|timeout|ETIMEDOUT|ECONNREFUSED|fetch failed/i,
		message:
			"No pudimos alcanzar el servicio a tiempo. Comprueba el enlace y tu red, e inténtalo de nuevo.",
	},
	{
		test: /Credenciales revocadas/i,
		message: "El acceso fue revocado. Guarda de nuevo la conexión si quieres reactivarla.",
	},
]

function sanitizeJargon(value: string): string {
	if (/smoke|probe/i.test(value)) {
		return "No se pudo completar la acción. Revisa la conexión e inténtalo de nuevo."
	}
	return value.length > 180
		? "No se pudo completar la acción. Intenta de nuevo en unos momentos."
		: value
}

export function mapProviderIntegrationError(raw: string | null | undefined): string {
	const value = String(raw ?? "").trim()
	if (!value) return "Revisa los datos e intenta de nuevo."
	if (exactMessages[value]) return exactMessages[value]
	for (const rule of successPatterns) {
		if (rule.test.test(value)) return rule.message
	}
	for (const rule of errorPatterns) {
		if (rule.test.test(value)) return rule.message
	}
	return sanitizeJargon(value)
}

export function mapProviderIntegrationLogMessage(raw: string | null | undefined): string {
	return mapProviderIntegrationError(raw)
}
