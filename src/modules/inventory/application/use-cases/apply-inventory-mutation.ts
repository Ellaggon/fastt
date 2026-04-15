import { recomputeEffectiveAvailabilityRange } from "./recompute-effective-availability-range"
import { and, db, EffectiveAvailability, eq, gte, lt } from "astro:db"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"

type RecomputeInstruction = {
	variantId: string
	from: string
	to: string
	reason: string
	idempotencyKey?: string
}

function isSqliteBusyError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return message.includes("SQLITE_BUSY") || message.includes("database is locked")
}

const recomputeQueues = new Map<string, Promise<void>>()

function recomputeKey(instruction: RecomputeInstruction): string {
	return `${instruction.variantId}:${instruction.from}:${instruction.to}`
}

async function enqueueRecompute(
	instruction: RecomputeInstruction
): Promise<{ retries: number } | undefined> {
	const key = recomputeKey(instruction)
	const prev = recomputeQueues.get(key) ?? Promise.resolve()
	const current = prev
		.catch(() => undefined)
		.then(() => recomputeEffectiveAvailabilityRange(instruction))
	recomputeQueues.set(
		key,
		current.then(
			() => undefined,
			() => undefined
		)
	)
	try {
		await current
	} finally {
		const queued = recomputeQueues.get(key)
		if (queued === current || !queued) {
			recomputeQueues.delete(key)
		}
	}
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function applyInventoryMutation<T>(params: {
	mutate: () => Promise<T>
	recompute:
		| RecomputeInstruction
		| RecomputeInstruction[]
		| ((result: T) => RecomputeInstruction | RecomputeInstruction[])
	failSoft?: boolean
	logContext?: Record<string, unknown>
}): Promise<T> {
	const startedAt = Date.now()
	const mutationTimeoutMs = Number(process.env.INVENTORY_MUTATION_TIMEOUT_MS ?? 3000)
	const recomputeTimeoutMs = Number(process.env.INVENTORY_RECOMPUTE_CHAIN_TIMEOUT_MS ?? 5000)
	let mutationRetries = 0
	let recomputeRetries = 0

	const runMutationWithRetry = async (): Promise<T> => {
		const maxAttempts = 8
		let lastError: unknown = null
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await params.mutate()
			} catch (error) {
				lastError = error
				if (Date.now() - startedAt >= mutationTimeoutMs) {
					throw new Error("mutation_retry_timeout")
				}
				if (!isSqliteBusyError(error) || attempt >= maxAttempts) {
					throw error
				}
				mutationRetries += 1
				incrementCounter("sqlite_busy_total", { phase: "mutation" })
				if (String(params.logContext?.action ?? "") === "booking_confirm") {
					incrementCounter("booking_confirm_retry_total", { phase: "mutation" })
				}
				await sleep(25 * attempt)
			}
		}
		throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "mutation_failed"))
	}

	const validateInstructions = async (instructions: RecomputeInstruction[]) => {
		for (const instruction of instructions) {
			const rows = await db
				.select({
					date: EffectiveAvailability.date,
					totalUnits: EffectiveAvailability.totalUnits,
					heldUnits: EffectiveAvailability.heldUnits,
					bookedUnits: EffectiveAvailability.bookedUnits,
					availableUnits: EffectiveAvailability.availableUnits,
					stopSell: EffectiveAvailability.stopSell,
					isSellable: EffectiveAvailability.isSellable,
				})
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, instruction.variantId),
						gte(EffectiveAvailability.date, instruction.from),
						lt(EffectiveAvailability.date, instruction.to)
					)
				)
				.all()

			for (const row of rows) {
				const total = Number(row.totalUnits ?? 0)
				const held = Number(row.heldUnits ?? 0)
				const booked = Number(row.bookedUnits ?? 0)
				const available = Number(row.availableUnits ?? 0)
				const stopSell = Boolean(row.stopSell)
				const isSellable = Boolean(row.isSellable)

				const invalid =
					held < 0 ||
					booked < 0 ||
					total < 0 ||
					available < 0 ||
					held + booked > total ||
					available !== Math.max(0, total - held - booked) ||
					isSellable !== (available > 0 && stopSell === false)

				if (invalid) {
					throw new Error(
						`inventory_invariant_violation:${instruction.variantId}:${String(row.date)}`
					)
				}
			}
		}
	}

	const mutationResult = await runMutationWithRetry()
	const recomputeValue =
		typeof params.recompute === "function" ? params.recompute(mutationResult) : params.recompute
	const instructions = Array.isArray(recomputeValue) ? recomputeValue : [recomputeValue]
	const failSoft = params.failSoft === true

	for (const instruction of instructions) {
		try {
			if (Date.now() - startedAt >= recomputeTimeoutMs) {
				throw new Error("recompute_chain_timeout")
			}
			// Serialize recomputes for the same variant/range to reduce SQLITE contention.
			const recomputeResult = await enqueueRecompute(instruction)
			recomputeRetries += Number(recomputeResult?.retries ?? 0)
		} catch (error) {
			logger.error("inventory.apply_mutation.recompute_failed", {
				...params.logContext,
				variantId: instruction.variantId,
				from: instruction.from,
				to: instruction.to,
				reason: instruction.reason,
				idempotencyKey: instruction.idempotencyKey ?? null,
				message: error instanceof Error ? error.message : String(error),
				busy: isSqliteBusyError(error),
			})
			if (!failSoft) throw error
		}
	}

	for (const instruction of instructions) {
		try {
			const { materializeSearchUnitRange } = await import("@/modules/search/public")
			await materializeSearchUnitRange({
				variantId: instruction.variantId,
				from: instruction.from,
				to: instruction.to,
				currency: "USD",
			})
		} catch (error) {
			logger.warn("search_unit_materialization_failed", {
				...params.logContext,
				variantId: instruction.variantId,
				from: instruction.from,
				to: instruction.to,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}
	try {
		await validateInstructions(instructions)
	} catch (error) {
		logger.error("inventory.apply_mutation.invariant_validation_failed", {
			...params.logContext,
			instructions,
			message: error instanceof Error ? error.message : String(error),
		})
		if (!failSoft) {
			throw error
		}
	}

	logger.info("inventory.apply_mutation", {
		...params.logContext,
		variantId: instructions[0]?.variantId ?? null,
		from: instructions[0]?.from ?? null,
		to: instructions[instructions.length - 1]?.to ?? null,
		mutationRetries,
		recomputeRetries,
		instructions: instructions.length,
		durationMs: Date.now() - startedAt,
	})

	return mutationResult
}
