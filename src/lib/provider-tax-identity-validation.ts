/**
 * Country-aware taxpayer / registration number format checks.
 * Not a live IRS/TIN bureau match — format + checksum where local rules are clear
 * (Airbnb/Expedia collect then validate; we gate obvious invalids before admin verify).
 */

export type TaxIdentityValidationResult = {
	ok: boolean
	normalized: string | null
	code?: string
	message?: string
}

function digitsOnly(value: string): string {
	return value.replace(/\D+/g, "")
}

function validateChileRut(raw: string): TaxIdentityValidationResult {
	const cleaned = raw.replace(/\./g, "").replace(/\s+/g, "").toUpperCase()
	const match = cleaned.match(/^(\d{7,8})-([\dK])$/)
	if (!match) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_cl_rut_format",
			message: "RUT chileno inválido. Usa formato 12345678-9.",
		}
	}
	const body = match[1]
	const dv = match[2]
	let sum = 0
	let mul = 2
	for (let i = body.length - 1; i >= 0; i -= 1) {
		sum += Number(body[i]) * mul
		mul = mul === 7 ? 2 : mul + 1
	}
	const mod = 11 - (sum % 11)
	const expected = mod === 11 ? "0" : mod === 10 ? "K" : String(mod)
	if (expected !== dv) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_cl_rut_checksum",
			message: "RUT chileno con dígito verificador incorrecto.",
		}
	}
	return { ok: true, normalized: `${body}-${dv}` }
}

function validateBoliviaNit(raw: string): TaxIdentityValidationResult {
	const digits = digitsOnly(raw)
	if (digits.length < 7 || digits.length > 12) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_bo_nit",
			message: "El NIT boliviano debe tener entre 7 y 12 dígitos.",
		}
	}
	return { ok: true, normalized: digits }
}

function validateUsEin(raw: string): TaxIdentityValidationResult {
	const cleaned = raw.trim()
	if (!/^\d{2}-?\d{7}$/.test(cleaned)) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_us_ein",
			message: "EIN estadounidense inválido. Usa XX-XXXXXXX.",
		}
	}
	const digits = digitsOnly(cleaned)
	return { ok: true, normalized: `${digits.slice(0, 2)}-${digits.slice(2)}` }
}

function validateArgentinaCuit(raw: string): TaxIdentityValidationResult {
	const digits = digitsOnly(raw)
	if (digits.length !== 11) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_ar_cuit",
			message: "CUIT argentino inválido (11 dígitos).",
		}
	}
	const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
	let sum = 0
	for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * weights[i]
	const mod = 11 - (sum % 11)
	const expected = mod === 11 ? 0 : mod === 10 ? 9 : mod
	if (expected !== Number(digits[10])) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_ar_cuit_checksum",
			message: "CUIT argentino con dígito verificador incorrecto.",
		}
	}
	return {
		ok: true,
		normalized: `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`,
	}
}

function validateGeneric(raw: string): TaxIdentityValidationResult {
	const normalized = raw.replace(/\s+/g, "").toUpperCase()
	if (normalized.length < 5 || normalized.length > 32) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_tax_id_length",
			message: "El número de registro fiscal debe tener entre 5 y 32 caracteres.",
		}
	}
	if (!/^[A-Z0-9./-]+$/.test(normalized)) {
		return {
			ok: false,
			normalized: null,
			code: "invalid_tax_id_chars",
			message: "El número de registro fiscal contiene caracteres no permitidos.",
		}
	}
	return { ok: true, normalized }
}

const fiscalIdentityErrorMessages: Record<string, string> = {
	incomplete_tax_identity:
		"No se guardó el registro. Faltan país, NIT o régimen, así que el estado sigue en No configurado.",
	invalid_bo_nit: "No se guardó. El NIT boliviano debe tener entre 7 y 12 dígitos.",
	invalid_cl_rut_format: "No se guardó. El RUT chileno debe verse como 12345678-9.",
	invalid_cl_rut_checksum: "No se guardó. El dígito verificador del RUT no coincide.",
	invalid_us_ein: "No se guardó. El EIN debe verse como XX-XXXXXXX.",
	invalid_ar_cuit: "No se guardó. El CUIT argentino debe tener 11 dígitos.",
	invalid_ar_cuit_checksum: "No se guardó. El dígito verificador del CUIT no coincide.",
	invalid_tax_id_length: "No se guardó. El número de registro debe tener entre 5 y 32 caracteres.",
	invalid_tax_id_chars: "No se guardó. El número de registro tiene caracteres no permitidos.",
	invalid_tax_residence_country: "No se guardó. El país fiscal debe ser un código de dos letras.",
	registration_required: "No se guardó. Falta el NIT o registro mercantil.",
	validation_error: "No se guardó. Revisa país, NIT, régimen y modo de facturación.",
	forbidden: "Tu rol no puede editar la identidad fiscal.",
}

export function fiscalIdentityErrorMessage(code: string): string {
	const key = String(code ?? "").trim()
	return (
		fiscalIdentityErrorMessages[key] ??
		"No se guardó la identidad fiscal. Los datos de este envío no quedaron registrados."
	)
}

/** Same gate as the server upsert, so the form can block submit before navigation. */
export function previewFiscalIdentitySubmit(params: {
	taxResidenceCountry?: string | null
	businessRegistrationNumber?: string | null
	taxRegime?: string | null
}): { ok: true } | { ok: false; code: string; message: string } {
	const country = String(params.taxResidenceCountry ?? "")
		.trim()
		.toUpperCase()
	const regime = String(params.taxRegime ?? "").trim()
	const registration = validateTaxpayerRegistrationNumber({
		country,
		registrationNumber: params.businessRegistrationNumber,
		required: false,
	})
	if (!registration.ok) {
		return {
			ok: false,
			code: registration.code || "invalid_tax_registration",
			message: registration.message || "Revisa el NIT o registro mercantil.",
		}
	}
	if (country && !/^[A-Z]{2}$/.test(country)) {
		return {
			ok: false,
			code: "invalid_tax_residence_country",
			message: "El país fiscal debe ser un código de dos letras.",
		}
	}
	if (!country && !registration.normalized && !regime) {
		return {
			ok: false,
			code: "incomplete_tax_identity",
			message: "Completa el país, el NIT o el régimen antes de enviar.",
		}
	}
	return { ok: true }
}

export function validateTaxpayerRegistrationNumber(params: {
	country?: string | null
	registrationNumber?: string | null
	/** When false, empty registration is allowed (not_configured drafts). */
	required?: boolean
}): TaxIdentityValidationResult {
	const country = String(params.country ?? "")
		.trim()
		.toUpperCase()
	const raw = String(params.registrationNumber ?? "").trim()
	if (!raw) {
		if (params.required) {
			return {
				ok: false,
				normalized: null,
				code: "registration_required",
				message: "Número de registro fiscal requerido.",
			}
		}
		return { ok: true, normalized: null }
	}

	switch (country) {
		case "CL":
			return validateChileRut(raw)
		case "BO":
			return validateBoliviaNit(raw)
		case "US":
			return validateUsEin(raw)
		case "AR":
			return validateArgentinaCuit(raw)
		default:
			return validateGeneric(raw)
	}
}
