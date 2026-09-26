export const PROVIDER_FORM_FLASH_COOKIE = "fastt_provider_form_flash"

export type ProviderFormFlashForm = "identity" | "profile" | "settings"

export type ProviderFormFlash = {
	form: ProviderFormFlashForm
	values: Record<string, string>
	errors: Record<string, string>
}

const identityFields = [
	"displayName",
	"legalName",
	"holderType",
	"holderCountry",
	"taxResidenceCountry",
	"payoutCountry",
	"collectionModel",
] as const

const profileFields = ["timezone", "defaultCurrency", "supportEmail", "supportPhone"] as const

const allowedFields: Record<ProviderFormFlashForm, readonly string[]> = {
	identity: identityFields,
	profile: profileFields,
	settings: [...identityFields, ...profileFields],
}

function normalizeText(value: unknown) {
	return String(value ?? "")
		.trim()
		.slice(0, 500)
}

function safeValues(form: ProviderFormFlashForm, values: Record<string, unknown>) {
	return Object.fromEntries(
		allowedFields[form]
			.filter((field) => Object.prototype.hasOwnProperty.call(values, field))
			.map((field) => [field, normalizeText(values[field])])
	)
}

function safeErrors(form: ProviderFormFlashForm, errors: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(errors)
			.filter(([field]) => field === "form" || allowedFields[form].includes(field))
			.map(([field, message]) => [field, normalizeText(message)])
			.filter(([, message]) => Boolean(message))
	)
}

/** A short-lived, same-site flash payload for a failed HTML form submission. */
export function createProviderFormFlash(input: ProviderFormFlash): string {
	return Buffer.from(
		JSON.stringify({
			form: input.form,
			values: safeValues(input.form, input.values),
			errors: safeErrors(input.form, input.errors),
		})
	).toString("base64url")
}

export function readProviderFormFlash(value: unknown, expectedForm: ProviderFormFlashForm) {
	try {
		const parsed = JSON.parse(Buffer.from(String(value ?? ""), "base64url").toString("utf8")) as {
			form?: unknown
			values?: Record<string, unknown>
			errors?: Record<string, unknown>
		}
		if (parsed.form !== expectedForm) return null
		return {
			form: expectedForm,
			values: safeValues(expectedForm, parsed.values ?? {}),
			errors: safeErrors(expectedForm, parsed.errors ?? {}),
		} satisfies ProviderFormFlash
	} catch {
		return null
	}
}

export function providerFormErrorMessage(field: string, fallback = "Revisa este campo.") {
	const messages: Record<string, string> = {
		displayName: "Escribe un nombre comercial de al menos 2 caracteres.",
		legalName: "Escribe el nombre legal de al menos 2 caracteres.",
		holderType: "Selecciona quién operará el negocio.",
		holderCountry: "Usa un código de país de dos letras, por ejemplo BO.",
		taxResidenceCountry: "Usa un código de país de dos letras, por ejemplo BO.",
		payoutCountry: "Usa un código de país de dos letras, por ejemplo BO.",
		collectionModel: "Selecciona una opción válida.",
		timezone: "Selecciona una zona horaria válida.",
		defaultCurrency: "Selecciona una moneda válida.",
		supportEmail: "Ingresa un correo de soporte válido.",
		supportPhone: "Revisa el teléfono de soporte.",
	}
	return messages[field] ?? fallback
}
