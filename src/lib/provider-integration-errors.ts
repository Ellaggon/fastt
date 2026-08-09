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
	INTEGRATION_PRODUCTION_NOT_ALLOWED:
		"Tu cuenta todavía no cumple los requisitos generales para usar integraciones en producción.",
	CERTIFICATION_PROVIDER_PRODUCTION_FORBIDDEN:
		"Un proveedor de certificación sólo puede conectarse a staging; nunca puede usar producción.",
	CERTIFICATION_PROVIDER_REQUIRED:
		"Esta acción sólo está disponible dentro de un proveedor de certificación aislado.",
	INTEGRATION_CERTIFICATION_ID_REQUIRED:
		"Esta cuenta de certificación necesita una sesión autorizada antes de sincronizar.",
	CERTIFICATION_SANDBOX_CONNECTION_REQUIRED:
		"La certificación sólo puede ejecutarse con una conexión sandbox.",
	CERTIFICATION_VENDOR_MISMATCH:
		"La sesión de certificación no corresponde a este proveedor externo.",
	INTEGRATION_CERTIFICATION_PERMISSION_DENIED:
		"No tienes permiso explícito para ejecutar certificaciones de integraciones.",
	INTEGRATION_CERTIFICATION_NOT_ACTIVE:
		"La sesión de certificación no está lista para ejecutar pruebas.",
	INTEGRATION_CERTIFICATION_EXPIRED:
		"La sesión de certificación expiró. Crea o activa una nueva antes de continuar.",
	CERTIFICATION_FIXTURE_PRODUCT_REQUIRED:
		"La sesión de certificación no tiene un fixture aislado asignado.",
	INTEGRATION_CERTIFICATION_PREFLIGHT_REQUIRED:
		"La cobertura del fixture de certificación todavía está incompleta. Corrige el preflight antes de sincronizar.",
	INTEGRATION_PRODUCTION_CONNECTION_REQUIRED:
		"Configura esta conexión en Producción antes de habilitar sincronizaciones comerciales.",
	INTEGRATION_PRODUCTION_PREFLIGHT_BLOCKED:
		"La cobertura todavía está incompleta. Corrige los bloqueos del preflight y vuelve a validar.",
	INTEGRATION_PRODUCTION_CONFIRMATION_REQUIRED:
		"Confirma que revisaste la cobertura antes de activar producción.",
	INTEGRATION_RESUME_REQUIRES_HEALTHY:
		"Resuelve las incidencias abiertas antes de reanudar la sincronización.",
	INTEGRATION_RESUME_REQUIRES_INITIAL_SYNC:
		"Completa la sincronización inicial antes de activar la operación automática.",
	INTEGRATION_SYNC_PAUSED_OR_UNHEALTHY:
		"La conexión está pausada o requiere atención. Resuélvelo antes de enviar cambios.",
	INTEGRATION_INITIAL_SYNC_REQUIRED:
		"Ejecuta primero la sincronización inicial antes de enviar cambios incrementales.",
	INTEGRATION_SYNC_RUN_NOT_RETRYABLE: "Esta ejecución no admite un reintento manual.",
	INTEGRATION_SYNC_RETRY_CONTEXT_EXPIRED:
		"El detalle de este cambio ya no está disponible. Ejecuta un full sync de recuperación.",
	RECOVERY_FULL_SYNC_INITIAL_REQUIRED:
		"Completa primero la sincronización inicial antes de usar la recuperación completa.",
	RECOVERY_FULL_SYNC_COOLDOWN:
		"Ya se ejecutó una recuperación recientemente. Espera unos minutos antes de repetirla.",
	INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED:
		"La sincronización comercial está bloqueada hasta completar nuevamente el preflight.",
	INITIAL_ARI_AVAILABILITY_REJECTED:
		"Channex rechazó parte de la disponibilidad. Revisa la incidencia antes de reintentar.",
	INITIAL_ARI_PARTIAL:
		"Channex aceptó el envío con advertencias. Revisa el resultado antes de continuar.",
	INITIAL_ARI_ROOM_MAPPING_REQUIRED:
		"Falta mapear al menos una habitación vendible antes de sincronizar.",
	INITIAL_ARI_RATE_MAPPING_REQUIRED:
		"Falta mapear al menos una tarifa vendible antes de sincronizar.",
	INITIAL_ARI_PROPERTY_CONTEXT_REQUIRED:
		"La propiedad necesita moneda y zona horaria válidas antes de sincronizar.",
	MAPPING_EXTERNAL_ENTITY_NOT_FOUND:
		"El ID externo no existe en el catálogo completo del proveedor.",
	MAPPING_RATE_ROOM_MISMATCH:
		"La tarifa externa pertenece a una habitación distinta de la que está mapeada en Fastt.",
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
		test: /INITIAL_ARI_(?:CANONICAL_COVERAGE_INCOMPLETE|PRICE_INVALID|RESTRICTION_MISSING)/i,
		message:
			"Fastt no encontró 500 días completos de inventario, precios y restricciones. Revisa la configuración comercial.",
	},
	{
		test: /INITIAL_ARI_PRICE_CURRENCY_MISMATCH/i,
		message: "La moneda de una tarifa no coincide con la moneda configurada para la propiedad.",
	},
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
