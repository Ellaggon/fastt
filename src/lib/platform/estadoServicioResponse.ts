import { sanitizeReturnTo } from "@/lib/auth/returnTo"
import { DATABASE_CONNECTIVITY_PUBLIC_MESSAGE } from "@/shared/infrastructure/db/connectivity-error"

export function buildEstadoServicioHtml(retryHref: string): string {
	const safeHref = sanitizeReturnTo(retryHref, "/")
	const message = DATABASE_CONNECTIVITY_PUBLIC_MESSAGE
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>Servicio no disponible</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#020617;color:#e2e8f0}
main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:4rem 1rem}
.panel{max-width:32rem;text-align:center}
.kicker{font-size:.75rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8}
h1{margin:1rem 0 0;font-size:1.875rem;font-weight:600;color:#fff}
p{margin:1rem 0 0;line-height:1.75;color:#cbd5e1}
a{display:inline-flex;margin-top:1.5rem;padding:.625rem 1rem;border-radius:.5rem;background:#fff;color:#020617;font-weight:600;text-decoration:none}
a:hover{background:#f1f5f9}
</style>
</head>
<body>
<main>
<div class="panel">
<p class="kicker">Fastt</p>
<h1>No pudimos completar la página</h1>
<p>${message}</p>
<a href="${safeHref}">Reintentar</a>
</div>
</main>
</body>
</html>`
}

export function buildEstadoServicioResponse(retryHref: string): Response {
	return new Response(buildEstadoServicioHtml(retryHref), {
		status: 503,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Retry-After": "5",
			"Cache-Control": "no-store",
		},
	})
}
