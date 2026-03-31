export type ValidationIssue = {
	path: string[]
	message?: string
	code?: string
}

/**
 * Minimal structured validation error for policy write use-cases.
 * API handlers can translate this to:
 *   { error: "validation_error", details: issues }
 */
export class PolicyValidationError extends Error {
	public readonly code = "validation_error" as const
	public readonly issues: ValidationIssue[]

	constructor(issues: ValidationIssue[], message = "validation_error") {
		super(message)
		this.issues = issues
	}
}
