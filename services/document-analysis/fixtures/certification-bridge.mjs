import { createServer } from "node:https"
import { request } from "node:http"
import { readFileSync } from "node:fs"
import { pipeline } from "node:stream"

const [key, cert] = process.argv.slice(2)
const storage = "127.0.0.1:59039"
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
	const path = req.url ?? ""
	if (
		req.method !== "GET" ||
		!/^\/synthetic-documents\/provider-documents\/gateway-worker-certification-[a-f0-9-]+\/[a-zA-Z0-9_-]+\/original\?/.test(
			path
		)
	) {
		res.writeHead(404).end()
		return
	}
	const upstream = request(
		{
			hostname: "127.0.0.1",
			port: 59039,
			path,
			method: "GET",
			headers: { host: storage },
			timeout: 10000,
		},
		(response) => {
			res.writeHead(response.statusCode ?? 502)
			pipeline(response, res, () => {})
		}
	)
	upstream.on("timeout", () => upstream.destroy())
	upstream.on("error", () => res.end())
	upstream.end()
})
server.listen(59443, "127.0.0.1")
