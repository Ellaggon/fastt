declare global {
	interface Window {
		fasttOptionDestination: (href: string) => Promise<string>
	}
}
/** Commercial fields have already persisted; navigation failure must retain their identity. */
export async function persistOptionDestination(href: string) {
	const source = new URL(window.location.href)
	if (source.searchParams.get("playbook") !== "add-tour-option") return href
	const target = new URL(href, source)
	const sessionId = source.searchParams.get("sessionId") || ""
	if (target.searchParams.get("playbook") !== "add-tour-option") return href
	const marker = document.querySelector<HTMLElement>("[data-option-session]")
	if (!marker) throw new Error("Los datos están guardados. Recarga para recuperar el recorrido.")
	const response = await fetch("/api/onboarding/tour-option-session", {
		method: "POST",
		signal: AbortSignal.timeout(15000),
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			sessionId,
			lastPath: target.pathname + target.search,
			revision: Number(marker.dataset.revision),
		}),
	})
	const body = await response.json().catch(() => ({}))
	if (!response.ok)
		throw new Error(
			body.message || "Los datos están guardados; no pudimos guardar la continuación. Reintenta."
		)
	marker.dataset.revision = String(body.revision)
	return body.href as string
}
