import { ZodError } from "zod"
import { mapZodError, type ValidationErrorMap } from "./mapZodError"

export class ValidationError extends Error {
	public readonly errors: ValidationErrorMap

	constructor(source: ZodError | ValidationErrorMap) {
		super("validation_error")
		this.name = "ValidationError"
		this.errors = source instanceof ZodError ? mapZodError(source) : source
	}
}
