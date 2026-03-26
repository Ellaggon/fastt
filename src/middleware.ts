import type { MiddlewareHandler } from "astro"

import { releaseExpiredHolds } from "@/modules/inventory/public"
import { inventoryHoldRepository } from "@/container"

type SweeperState = {
	started: boolean
	running: boolean
	intervalId: ReturnType<typeof setInterval> | null
}

function getSweeperState(): SweeperState {
	const g = globalThis as any
	if (!g.__inventoryHoldSweeper) {
		g.__inventoryHoldSweeper = {
			started: false,
			running: false,
			intervalId: null,
		} satisfies SweeperState
	}
	return g.__inventoryHoldSweeper as SweeperState
}

function startSweeperIfEnabled() {
	const state = getSweeperState()
	if (state.started) return

	// Default enabled in Node runtime. Can be disabled for specific deployments if needed.
	if (process.env.INVENTORY_HOLD_SWEEPER_ENABLED === "false") {
		state.started = true
		return
	}

	const rawMs = Number(process.env.INVENTORY_HOLD_SWEEPER_INTERVAL_MS ?? 120_000)
	// Clamp to 1–5 minutes.
	const intervalMs = Math.min(300_000, Math.max(60_000, Number.isFinite(rawMs) ? rawMs : 120_000))

	state.started = true
	state.intervalId = setInterval(async () => {
		// Prevent overlapping runs if a tick takes longer than the interval.
		if (state.running) return
		state.running = true
		try {
			const { releasedHolds } = await releaseExpiredHolds(
				{ repo: inventoryHoldRepository },
				{ now: new Date() }
			)
			if (releasedHolds > 0) {
				console.log(
					JSON.stringify({
						action: "inventory_hold_sweep",
						releasedHolds,
						ok: true,
					})
				)
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			console.log(
				JSON.stringify({
					action: "inventory_hold_sweep",
					ok: false,
					error: msg,
				})
			)
		} finally {
			state.running = false
		}
	}, intervalMs)
}

export const onRequest: MiddlewareHandler = async (_ctx, next) => {
	startSweeperIfEnabled()
	return next()
}
