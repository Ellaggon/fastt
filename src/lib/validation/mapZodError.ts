import type { ZodError } from "zod"

export type ValidationErrorMap = Record<string, string>

export function mapZodError(error: ZodError): ValidationErrorMap {
	const mapped: ValidationErrorMap = {}

	for (const issue of error.issues) {
		const key = issue.path.length > 0 ? issue.path.join(".") : "form"
		if (!mapped[key]) {
			mapped[key] = issue.message
		}
	}

	return mapped
}
