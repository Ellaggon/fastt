import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("./fixtures", import.meta.url))
const port = Number(process.env.PLAYWRIGHT_FIXTURE_PORT || 4177)

const types = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url || "/", `http://127.0.0.1:${port}`)
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ ok: true }))
			return
		}
		const rel = url.pathname === "/" ? "/tour-pdp-harness.html" : url.pathname
		const safe = rel.replace(/\.\./g, "")
		const filePath = join(root, safe)
		const body = await readFile(filePath)
		res.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" })
		res.end(body)
	} catch {
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
		res.end("not found")
	}
})

server.listen(port, "127.0.0.1", () => {
	console.log(`e2e fixtures on http://127.0.0.1:${port}`)
})
