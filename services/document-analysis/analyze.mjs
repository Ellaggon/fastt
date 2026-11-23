import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)
const MAX_BYTES = 12 * 1024 * 1024
const MAX_PAGES = 5

export function extractIssueFields(pages) {
	const fields = []
	for (const [key, pattern] of [
		["issuer", /^\s*(?:emisor|emitido por|expedido por)\s*:\s*(\S.{0,119})$/iu],
		["issued_at", /^\s*fecha de (?:emisi[oó]n|expedici[oó]n)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/iu],
	]) {
		const candidates = pages.flatMap((text, index) =>
			text.split(/\r?\n/).flatMap((line) => {
				const value = pattern.exec(line)?.[1]?.trim()
				if (!value) return []
				if (key === "issued_at") {
					const date = new Date(value + "T00:00:00Z")
					if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) return []
				}
				return [{ key, value, page: index + 1 }]
			})
		)
		if (new Set(candidates.map(({ value }) => value)).size === 1) fields.push(candidates[0])
	}
	return fields
}

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
		let pages = 1
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
			pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
			if (pages < 1 || pages > MAX_PAGES) {
				result.qualitySignals.readingReason = pages < 1 ? "unknown_page_count" : "page_limit"
				return result
			}
		}
		try {
			const texts = []
			const extended = process.env.DOCUMENT_ANALYSIS_LOCAL_EXTENDED === "true"
			const signal = AbortSignal.timeout(extended ? 60_000 : 20_000)
			const options = { signal, timeout: 8_000, maxBuffer: 128 * 1024 }
			let failedStage = null
			const retries = []
			const measure = async (page, stage, command, args, options) => {
				const start = performance.now()
				try {
					return await execute(command, args, options)
				} finally {
					result.qualitySignals[`page${page}${stage}Ms`] = Math.round(performance.now() - start)
				}
			}
			for (let page = 1; page <= pages; page++) {
				const renderOptions = { ...options, timeout: 3_000 }
				const started = performance.now()
				const recordPage = (outcome) => {
					result.qualitySignals[`page${page}Ms`] = Math.round(performance.now() - started)
					result.qualitySignals[`page${page}Outcome`] = outcome
				}
				if (signal.aborted) {
					recordPage("budget_exhausted")
					failedStage ??= "ocr_timeout"
					break
				}
				let image = file
				let digital = ""
				if (input.mimeType === "application/pdf") {
					const { stdout } = await measure(
						page,
						"Digital",
						"pdftotext",
						["-f", String(page), "-l", String(page), "-layout", file, "-"],
						{ ...options, timeout: 1_000 }
					).catch(() => ({ stdout: "" }))
					digital = stdout
					if (stdout.trim().length >= 20) {
						texts.push(stdout)
						recordPage("digital")
						continue
					}
					const target = join(directory, "page-" + page)
					const rasterized = await measure(
						page,
						"Render",
						"pdftoppm",
						[
							"-f",
							String(page),
							"-l",
							String(page),
							"-singlefile",
							"-scale-to",
							"1800",
							"-png",
							file,
							target,
						],
						renderOptions
					).then(
						() => true,
						() => false
					)
					if (!rasterized) {
						failedStage ??= "page_render_error"
						texts.push(digital)
						recordPage("render_error")
						continue
					}
					image = target + ".png"
				}
				const readImage = (path) =>
					measure(page, "Ocr", "tesseract", [path, "stdout", "-l", "spa+eng"], {
						...options,
						timeout: extended ? 12_000 : 5_000,
						env: { ...process.env, OMP_THREAD_LIMIT: "1" },
					})
				let stdout = ""
				let outcome = "ocr"
				try {
					;({ stdout } = await readImage(image))
				} catch (firstError) {
					outcome = signal.aborted || firstError.killed ? "ocr_timeout" : "ocr_engine_error"
					retries.push({ page, image, outcome })
				}
				texts.push(stdout.trim() ? stdout : digital)
				recordPage(!stdout.trim() && outcome === "ocr" ? "no_text" : outcome)
			}
			for (const { page, image, outcome } of retries) {
				if (signal.aborted) {
					failedStage ??= outcome
					continue
				}
				const started = performance.now()
				try {
					const { stdout } = await measure(
						page,
						"Retry",
						"tesseract",
						[image, "stdout", "-l", "spa+eng", "--psm", "11"],
						{
							...options,
							env: { ...process.env, OMP_THREAD_LIMIT: "1" },
						}
					)
					if (stdout.trim()) texts[page - 1] = stdout
					result.qualitySignals[`page${page}Outcome`] = stdout.trim() ? "ocr_retry" : "no_text"
				} catch (error) {
					failedStage ??= signal.aborted || error.killed ? "ocr_timeout" : "ocr_engine_error"
				} finally {
					result.qualitySignals[`page${page}Ms`] += Math.round(performance.now() - started)
				}
			}
			result.qualitySignals.pagesWithText = texts.filter((text) => text.trim()).length
			if (failedStage) {
				result.ocr.status = "error"
				result.qualitySignals.readingReason = failedStage
				return result
			}
			if (texts.every((text) => text.trim())) {
				result.ocr.status = "completed"
				result.extraction.fields = extractIssueFields(texts)
				if (result.extraction.fields.length) result.extraction.status = "completed"
				if (result.extraction.fields.length < 2)
					result.qualitySignals.readingReason = "issue_fields_unresolved"
			} else result.qualitySignals.readingReason = "pages_without_text"
		} catch {
			result.ocr.status = "error"
			result.qualitySignals.readingReason = "reading_error"
		}
		return result
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}
