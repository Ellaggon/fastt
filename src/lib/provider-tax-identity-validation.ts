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
			message: "NIT boliviano inválido (7–12 dígitos).",
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
