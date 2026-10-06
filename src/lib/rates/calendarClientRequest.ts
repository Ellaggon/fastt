/** A bounded read. Mutation requests deliberately do not use automatic retries. */
export class CalendarReadError extends Error {
	constructor(
		message: string,
		readonly requiresSignIn = false
	) {
		super(message)
	}
}
export async function readCalendarResponse(url: string, signal?: AbortSignal) {
	const controller = new AbortController()
	const abort = () => controller.abort(signal?.reason)
	if (signal?.aborted) abort()
	signal?.addEventListener("abort", abort, { once: true })
	let timedOut = false
	const timer = setTimeout(() => {
		timedOut = true
		controller.abort()
	}, 20000)
	try {
		const response = await fetch(url, { signal: controller.signal })
		if (
			response.status === 401 ||
			(response.redirected && new URL(response.url).pathname === "/SignInPage")
		) {
			throw new CalendarReadError("Tu sesión venció. Inicia sesión para continuar.", true)
		}
		const body = await response.json().catch(() => ({}))
		if (!response.ok || !body.surface)
			throw new CalendarReadError(
				body.message || body.error || "No se pudo consultar el calendario."
			)
		return body
	} catch (error) {
		if (timedOut)
			throw new CalendarReadError("La consulta tardó demasiado. Puedes volver a intentarlo.")
		throw error
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener("abort", abort)
	}
}

export function calendarContinueState(input: {
	loading: boolean
	failed: boolean
	dirty: boolean
	saving: boolean
	hasAvailability: boolean
}) {
	if (input.saving) return { label: "Guardando…", disabled: true }
	if (input.loading) return { label: "Cargando calendario…", disabled: true }
	if (input.failed) return { label: "Calendario no disponible", disabled: true }
	if (input.dirty) return { label: "Guardar y continuar", disabled: false }
	return {
		label: input.hasAvailability ? "Continuar a publicación" : "Completar después",
		disabled: false,
	}
}

export async function continueCalendarAfterSave(input: {
	dirty: boolean
	save: () => Promise<boolean>
	href: string
	navigate: (href: string) => void
}) {
	if (input.dirty && !(await input.save())) return false
	input.navigate(input.href)
	return true
}

/** A timed-out write has an unknown outcome: never retry it automatically. */
export async function saveCalendarAvailability(payload: unknown) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 30000)
	try {
		const response = await fetch("/api/inventory/bulk-apply", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: controller.signal,
		})
		if (response.status === 401)
			throw new CalendarReadError("Tu sesión venció. Inicia sesión para continuar.", true)
		const body = await response.json()
		if (!response.ok || !body.summary || Number(body.summary.failed || 0) > 0)
			throw new Error(
				body.failures?.[0]?.error || body.error || "No se pudo guardar la disponibilidad."
			)
		return body
	} catch (error) {
		if (error instanceof CalendarReadError) throw error
		if (
			error instanceof Error &&
			(error.name === "AbortError" || error instanceof TypeError || error instanceof SyntaxError)
		)
			throw new Error(
				"No pudimos confirmar el guardado. Revisa el calendario antes de volver a guardar; tus cambios se conservan en el editor."
			)
		throw error
	} finally {
		clearTimeout(timer)
	}
}

export function calendarRecoveryReturnTo(
	currentHref: string,
	selection: { ratePlanId?: string; variantId?: string; month?: string }
) {
	const url = new URL(currentHref)
	for (const key of ["ratePlanId", "variantId", "month"] as const)
		if (selection[key]) url.searchParams.set(key, selection[key]!)
	return url.pathname + url.search
}
