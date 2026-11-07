import { afterEach, expect, test, vi } from "vitest"
import { readFileSync } from "node:fs"
import { assertDocumentPipelineEnabled, documentPipelineEnabled } from "@/lib/documents/activation"

afterEach(() => vi.unstubAllEnvs())
test.each(["", "false", "1", "TRUE", " true "])(
	"fails closed for non-exact activation %s",
	(value) => {
		vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", value)
		expect(documentPipelineEnabled()).toBe(false)
		expect(assertDocumentPipelineEnabled).toThrow("document_pipeline_disabled")
	}
)
test("absent flag is disabled even with credentials present", () => {
	vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", undefined)
	vi.stubEnv("DOCUMENT_ANALYSIS_GATEWAY_TOKEN", "configured")
	expect(documentPipelineEnabled()).toBe(false)
})
test("requires explicit opt-in", () => {
	vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "true")
	expect(assertDocumentPipelineEnabled).not.toThrow()
})
test("worker checks activation before touching the backlog", () => {
	const source = readFileSync(
		new URL("../../src/lib/documents/document-processing.ts", import.meta.url),
		"utf8"
	)
	const worker = source.slice(
		source.indexOf("export async function runProviderDocumentProcessingWorker")
	)
	expect(worker.indexOf("assertDocumentPipelineEnabled()")).toBeLessThan(
		worker.indexOf("await ensureDocumentProcessingBacklog()")
	)
})
