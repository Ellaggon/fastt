import { z } from "zod"

/** B1 defines observations, not a second evaluator of pricing or eligibility rules. */
export const TOUR_REQUIREMENTS = {
	presentation: { axis: "preparation", scope: "product" },
	logistics: { axis: "preparation", scope: "product" },
	photos: { axis: "preparation", scope: "product" },
	participants: { axis: "preparation", scope: "product" },
	activities: { axis: "preparation", scope: "product" },
	option_profile: { axis: "preparation", scope: "option" },
	group_capacity: { axis: "preparation", scope: "option" },
	price: { axis: "preparation", scope: "rate" },
	conditions: { axis: "preparation", scope: "rate" },
	calendar_configuration: { axis: "preparation", scope: "option" },
	provider_authorization: { axis: "authorization", scope: "product" },
	experience_authorization: { axis: "authorization", scope: "product" },
	option_activation: { axis: "activation", scope: "option" },
	rate_activation: { axis: "activation", scope: "rate" },
	current_availability: { axis: "operation", scope: "option" },
} as const

export type TourRequirementId = keyof typeof TOUR_REQUIREMENTS
const requirementIds = Object.keys(TOUR_REQUIREMENTS) as [TourRequirementId, ...TourRequirementId[]]
const scopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("product"), productId: z.string().min(1) }).strict(),
	z
		.object({
			kind: z.literal("option"),
			productId: z.string().min(1),
			variantId: z.string().min(1).nullable(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("rate"),
			productId: z.string().min(1),
			variantId: z.string().min(1).nullable(),
			ratePlanId: z.string().min(1).nullable(),
		})
		.strict(),
])
const reason = z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()
const action = z
	.object({
		label: z.string().min(1),
		// Navigation adapters must also validate ownership and preserve selected object IDs.
		href: z.string().regex(/^\/(?!\/)[^\\]*$/),
	})
	.strict()
const resultSchema = z.discriminatedUnion("state", [
	z
		.object({
			state: z.literal("ready"),
			evidence: z.object({ source: z.string().min(1), reference: z.string().min(1) }).strict(),
		})
		.strict(),
	z
		.object({
			state: z.literal("pending"),
			reason,
			responsible: z.enum(["provider", "fastt"]),
			action,
		})
		.strict(),
	z
		.object({
			state: z.literal("blocked"),
			reason,
			responsible: z.enum(["provider", "fastt"]),
			action,
		})
		.strict(),
	z
		.object({
			state: z.literal("not_evaluable"),
			reason,
			responsible: z.enum(["provider", "fastt"]),
			action,
		})
		.strict(),
	z
		.object({
			state: z.literal("not_applicable"),
			reason,
			applicabilityReference: z.string().min(1),
		})
		.strict(),
])

export const tourDiagnosticSchema = z
	.object({
		version: z.literal(1),
		context: z
			.object({
				providerId: z.string().min(1),
				productId: z.string().min(1),
				selection: z.discriminatedUnion("state", [
					z
						.object({
							state: z.literal("resolved"),
							variantId: z.string().min(1),
							ratePlanId: z.string().min(1),
							bookingMode: z.enum(["shared", "private"]),
							source: z.enum(["url", "session", "sole_option"]),
						})
						.strict(),
					z
						.object({
							state: z.literal("unresolved"),
							reason: z.enum([
								"missing_option",
								"missing_rate",
								"selection_required",
								"invalid_selection",
								"read_failed",
							]),
						})
						.strict(),
				]),
				timezone: z.string().refine((value) => {
					try {
						new Intl.DateTimeFormat("en", { timeZone: value })
						return true
					} catch {
						return false
					}
				}),
				observedAt: z.iso.datetime(),
			})
			.strict(),
		requirements: z.record(
			z.enum(requirementIds),
			z.object({ scope: scopeSchema, result: resultSchema }).strict()
		),
	})
	.strict()
	.superRefine((diagnosis, ctx) => {
		for (const id of requirementIds) {
			const { scope, result } = diagnosis.requirements[id]
			const selection = diagnosis.context.selection
			if (
				scope.kind !== TOUR_REQUIREMENTS[id].scope ||
				scope.productId !== diagnosis.context.productId ||
				(selection.state === "resolved" &&
					scope.kind !== "product" &&
					(scope.variantId !== selection.variantId ||
						(scope.kind === "rate" && scope.ratePlanId !== selection.ratePlanId)))
			) {
				ctx.addIssue({
					code: "custom",
					path: ["requirements", id, "scope"],
					message: "Requirement belongs to another scope or selection",
				})
			}
			if (
				selection.state === "unresolved" &&
				scope.kind !== "product" &&
				result.state !== "not_evaluable"
			) {
				ctx.addIssue({
					code: "custom",
					path: ["requirements", id],
					message: "An unresolved selection cannot establish option or rate readiness",
				})
			}
			// No current preparation requirement is waived merely because a tour is private.
			if (TOUR_REQUIREMENTS[id].axis === "preparation" && result.state === "not_applicable") {
				ctx.addIssue({
					code: "custom",
					path: ["requirements", id],
					message: "Preparation requirements cannot be waived in contract v1",
				})
			}
		}
	})

export type TourDiagnostic = z.infer<typeof tourDiagnosticSchema>
export type TourRequirementResult = z.infer<typeof resultSchema>

/** Pure projection: unknown results remain in the denominator and never grant permission. */
export function summarizeTourDiagnostic(input: TourDiagnostic) {
	const diagnosis = tourDiagnosticSchema.parse(input)
	const summarize = (axis: "preparation" | "authorization" | "activation" | "operation") => {
		const results = requirementIds
			.filter((id) => TOUR_REQUIREMENTS[id].axis === axis)
			.map((id) => diagnosis.requirements[id].result)
		const applicable = results.filter((result) => result.state !== "not_applicable")
		const readyCount = applicable.filter((result) => result.state === "ready").length
		return {
			readyCount,
			totalCount: applicable.length,
			complete: applicable.length > 0 && readyCount === applicable.length,
		}
	}
	const preparation = summarize("preparation")
	return {
		preparation: {
			...preparation,
			readinessPercent: Math.round((preparation.readyCount / preparation.totalCount) * 100),
		},
		authorization: summarize("authorization"),
		activation: summarize("activation"),
		operation: summarize("operation"),
		// Authoritative capabilities require server evaluators (B3), not these counts.
		transactionSemantics:
			diagnosis.context.selection.state === "unresolved"
				? "unresolved"
				: diagnosis.context.selection.bookingMode === "private"
					? "request_without_hold_or_quote"
					: "booking_requires_quote_and_hold",
	}
}

export type TourCapability = "prepare" | "activate" | "publish" | "book" | "receive_request"
/** An evaluator supplies a decision for this exact diagnosis; ready counts are not authorization. */
export type TourCapabilityDecision = {
	capability: TourCapability
	source: string
} & (
	| { allowed: true; evaluatedRequirementIds: readonly TourRequirementId[] }
	| {
			allowed: false
			blockers: readonly [
				{ requirementId: TourRequirementId; reason: { code: string; message: string } },
				...{ requirementId: TourRequirementId; reason: { code: string; message: string } }[],
			]
	  }
)
