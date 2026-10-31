import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)
const MAX_BYTES = 12 * 1024 * 1024

export function validateAnalysisRequest(input, config) {
	if (
		!input ||
		typeof input !== "object" ||
		!/^[a-zA-Z0-9_-]{1,160}$/.test(input.documentId ?? "") ||
		!/^[a-f0-9]{64}$/.test(input.sha256 ?? "") ||
		!["application/pdf", "image/jpeg", "image/png"].includes(input.mimeType)
	)
		throw new Error("invalid_request")
	const url = new URL(input.sourceUrl)
	if (
		url.origin !== config.sourceOrigin ||
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.hash ||
		!url.pathname.startsWith(config.sourcePathPrefix) ||
		!url.pathname.endsWith(`/${input.documentId}/original`) ||
		!url.searchParams.get("X-Amz-Signature")
	)
		throw new Error("source_not_allowed")
	return url
}

export async function engineReadiness(databaseDirectory = "/var/lib/clamav") {
	const databases = await Promise.all(
		["daily.cvd", "daily.cld"].map((file) => stat(join(databaseDirectory, file)).catch(() => null))
	)
	const newest = Math.max(...databases.map((file) => file?.mtimeMs ?? 0))
	if (Date.now() - newest > 48 * 60 * 60_000) throw new Error("antivirus_definitions_stale")
	const { stdout } = await execute("clamscan", ["--version"], { timeout: 5_000, maxBuffer: 4096 })
	return stdout.trim().slice(0, 120)
}

async function download(url, expectedHash) {
	const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) })
	if (
		!response.ok ||
		!response.body ||
		Number(response.headers.get("content-length") ?? 0) > MAX_BYTES
	)
		throw new Error("source_unavailable")
	const chunks = []
	let size = 0
	for await (const chunk of response.body) {
		size += chunk.length
		if (size > MAX_BYTES) {
			await response.body.cancel().catch(() => {})
			throw new Error("source_too_large")
		}
		chunks.push(chunk)
	}
	const bytes = Buffer.concat(chunks)
	if (!size || createHash("sha256").update(bytes).digest("hex") !== expectedHash)
		throw new Error("source_hash_mismatch")
	return bytes
}

/** Runs local engines; no OCR text or customer files are retained or logged. */
export async function analyzeDocument(input, config) {
	const url = validateAnalysisRequest(input, config)
	const definitionVersion = await engineReadiness()
	const bytes = await download(url, input.sha256)
	const directory = await mkdtemp(join(tmpdir(), "fastt-analysis-"))
	const file = join(directory, input.mimeType === "application/pdf" ? "source.pdf" : "source.image")
	try {
		await writeFile(file, bytes, { mode: 0o600 })
		let malware = "clean"
		try {
			await execute(
				"clamscan",
				[
					"--no-summary",
					"--max-scantime=20000",
					"--max-filesize=13M",
					"--max-scansize=30M",
					"--max-recursion=16",
					"--max-files=1000",
					"--alert-exceeds-max=yes",
					file,
				],
				{ timeout: 30_000, maxBuffer: 64 * 1024 }
			)
		} catch (error) {
			if (error.code === 1) malware = "infected"
			else throw new Error("antivirus_failed")
		}
		const result = {
			malware: { status: malware, engine: "clamav", definitionVersion },
			ocr: { status: "not_supported", provider: "tesseract", language: "spa+eng" },
			extraction: { status: "not_supported", fields: [] },
			tamper: { status: "inconclusive", signals: [] },
			qualitySignals: { byteSize: bytes.length, authenticityVerified: false },
		}
		if (malware !== "clean") return result
		let image = file
		if (input.mimeType === "application/pdf") {
			try {
				await execute("qpdf", ["--check", file], { timeout: 5_000, maxBuffer: 64 * 1024 })
			} catch {
				throw new Error("pdf_structure_invalid")
			}
			const { stdout } = await execute("pdfinfo", [file], {
				timeout: 5_000,
				maxBuffer: 64 * 1024,
				env: { ...process.env, LC_ALL: "C" },
			})
			const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
			// Bounded OCR is not presented as completed analysis of a multi-page document.
			if (pages !== 1) return result
			await execute(
				"pdftoppm",
				["-f", "1", "-singlefile", "-scale-to", "1800", "-png", file, join(directory, "page")],
				{ timeout: 8_000, maxBuffer: 4096 }
			)
			image = join(directory, "page.png")
		}
		try {
			const { stdout } = await execute("tesseract", [image, "stdout", "-l", "spa+eng"], {
				timeout: 10_000,
				maxBuffer: 128 * 1024,
			})
			result.ocr.status = stdout.trim() ? "completed" : "not_supported"
		} catch {
			result.ocr.status = "error"
		}
		return result
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}
