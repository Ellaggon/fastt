export type ValidationIssue = {
	path: string[]
	message?: string
	code?: string
}

export class BookingValidationError extends Error {
	public readonly code = "validation_error" as const
	public readonly issues: ValidationIssue[]

	constructor(issues: ValidationIssue[], message = "validation_error") {
		super(message)
		this.issues = issues
	}
}
