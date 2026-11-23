import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function pdf(objects) {
	const chunks = [Buffer.from("%PDF-1.4\n")]
	const offsets = [0]
	let length = chunks[0].length
	for (const [i, object] of objects.entries()) {
		offsets.push(length)
		const chunk = Buffer.concat([
			Buffer.from(`${i + 1} 0 obj\n`),
			Buffer.from(object),
			Buffer.from("\nendobj\n"),
		])
		chunks.push(chunk)
		length += chunk.length
	}
	return Buffer.concat([
		...chunks,
		Buffer.from(
			`xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
				offsets
					.slice(1)
					.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
					.join("") +
				`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`
		),
	])
}

const stream = (data, dict = "") =>
	Buffer.concat([
		Buffer.from(`<< ${dict} /Length ${Buffer.byteLength(data)} >>\nstream\n`),
		Buffer.from(data),
		Buffer.from("\nendstream"),
	])
const catalog = "<< /Type /Catalog /Pages 2 0 R >>"
const font = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
const page = (contents, resources) =>
	`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R /Resources << ${resources} >> >>`
const text = (line) => stream(`BT /F1 28 Tf 40 700 Td (${line}) Tj ET`)

export function makeProviderTestPdf({ scanned = false } = {}) {
	const title = scanned ? "Representante simulado" : "Empresa simulada"
	const lines = [
		"FICTICIO - SOLO PARA PRUEBAS - SIN VALIDEZ",
		"Paseos del Sur - entorno aislado",
		title,
		"Emisor: Laboratorio ficticio Fastt",
		"Fecha de emisi\\363n: 2026-11-14",
	]
	const content = stream(
		`BT /F1 20 Tf 40 730 Td 36 TL ${lines.map((line) => `(${line}) Tj`).join(" T* ")} ET`
	)
	const pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
	const digital = pdf([catalog, pages, page(4, "/Font << /F1 5 0 R >>"), content, font])
	if (!scanned) return digital
	const dir = mkdtempSync(join(tmpdir(), "fastt-provider-fixture-"))
	try {
		const input = join(dir, "input.pdf")
		const output = join(dir, "scan")
		writeFileSync(input, digital)
		execFileSync("pdftoppm", ["-singlefile", "-gray", "-r", "110", input, output])
		const image = readFileSync(output + ".pgm")
		const header = /^P5\n(\d+) (\d+)\n255\n/.exec(image.toString("latin1", 0, 64))
		if (!header) throw new Error("unexpected_fixture_image")
		return pdf([
			catalog,
			pages,
			page(4, "/XObject << /Scan 5 0 R >>"),
			stream("q 612 0 0 792 0 0 cm /Scan Do Q"),
			stream(
				image.subarray(header[0].length),
				`/Type /XObject /Subtype /Image /Width ${header[1]} /Height ${header[2]} /ColorSpace /DeviceGray /BitsPerComponent 8`
			),
		])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

export function makeMixedPdf() {
	const dir = mkdtempSync(join(tmpdir(), "fastt-mixed-"))
	try {
		const source = join(dir, "scan.pdf"),
			image = join(dir, "scan")
		writeFileSync(
			source,
			pdf([
				catalog,
				"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
				page(4, "/Font << /F1 5 0 R >>"),
				text("Fecha de emisi\\363n: 2026-11-14"),
				font,
			])
		)
		execFileSync("pdftoppm", ["-singlefile", "-gray", "-r", "110", source, image])
		const pgm = readFileSync(image + ".pgm")
		const header = /^P5\n(\d+) (\d+)\n255\n/.exec(pgm.toString("latin1", 0, 64))
		if (!header) throw new Error("unexpected_fixture_image")
		return pdf([
			catalog,
			"<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
			page(4, "/Font << /F1 5 0 R >>"),
			text("Emisor: Autoridad sintetica"),
			font,
			page(7, "/XObject << /Scan 8 0 R >>"),
			stream("q 612 0 0 792 0 0 cm /Scan Do Q"),
			stream(
				pgm.subarray(header[0].length),
				`/Type /XObject /Subtype /Image /Width ${header[1]} /Height ${header[2]} /ColorSpace /DeviceGray /BitsPerComponent 8`
			),
		])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}
