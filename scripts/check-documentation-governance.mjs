#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, normalize, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const args = process.argv.slice(2)
const staged = args.includes("--staged")
const baseIndex = args.indexOf("--base")
const base = baseIndex >= 0 ? args[baseIndex + 1] : process.env.DOCS_BASE_SHA
const MAX_NEW_BYTES = 16 * 1024
const MAX_GROWTH_BYTES = 2 * 1024
const metadataKeys = [
	"Status",
	"Document type",
	"Owner",
	"Last verified",
	"Scope",
	"Source of truth",
	"Review trigger",
]
const documentTypes = new Set([
	"governance",
	"canonical",
	"decision",
	"runbook",
	"certification",
	"archive",
	"index",
])

function git(commandArgs, { allowFailure = false } = {}) {
	const result = spawnSync("git", commandArgs, { cwd: root, encoding: "utf8" })
	if (result.status !== 0 && !allowFailure) {
		process.stderr.write(result.stderr || `git ${commandArgs.join(" ")} failed\n`)
		process.exit(2)
	}
	return result.stdout.trim()
}

function parseNameStatus(output) {
	const changed = new Map()
	for (const line of output.split("\n")) {
		if (!line) continue
		const parts = line.split("\t")
		const status = parts[0][0]
		const path = status === "R" || status === "C" ? parts[2] : parts[1]
		if (path?.endsWith(".md")) changed.set(path, status)
	}
	return changed
}

function changedMarkdown() {
	if (base) {
		return parseNameStatus(
			git(["diff", "--name-status", "--diff-filter=ACMR", `${base}...HEAD`, "--", "*.md"])
		)
	}

	if (staged) {
		return parseNameStatus(
			git(["diff", "--cached", "--name-status", "--diff-filter=ACMR", "--", "*.md"])
		)
	}

	const changed = parseNameStatus(
		git(["diff", "--name-status", "--diff-filter=ACMR", "HEAD", "--", "*.md"])
	)
	const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "*.md"])
	for (const path of untracked.split("\n").filter(Boolean)) changed.set(path, "A")
	return changed
}

function markdownFiles(directory) {
	if (!existsSync(directory)) return []
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...markdownFiles(path))
		else if (entry.isFile() && extname(entry.name) === ".md") files.push(path)
	}
	return files
}

function localLinks(content) {
	const links = []
	const expression = /!?\[[^\]]*\]\(([^)]+)\)/g
	for (const match of content.matchAll(expression)) {
		let target = match[1].trim()
		if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1)
		target = target.replace(/\s+["'][^"']*["']$/, "")
		if (
			!target ||
			target.startsWith("#") ||
			target.startsWith("/") ||
			/^[a-z][a-z+.-]*:/i.test(target)
		) {
			continue
		}
		target = target.split("#")[0].split("?")[0]
		if (target) links.push(decodeURIComponent(target))
	}
	return links
}

function metadata(content, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return content.match(new RegExp(`^${escaped}:\\s*(.+?)\\s{0,2}$`, "mi"))?.[1]?.trim()
}

function isIndex(path, content) {
	return (
		path.endsWith("/README.md") ||
		path === "docs/README.md" ||
		metadata(content, "Document type") === "index"
	)
}

function allowedTypePath(path, type) {
	if (type === "index") return true
	if (type === "governance") {
		return path.startsWith("docs/") && !path.slice("docs/".length).includes("/")
	}
	const prefixes = {
		canonical: "docs/domains/",
		decision: "docs/engineering/adr/",
		runbook: "docs/runbooks/",
		certification: "docs/certifications/",
		archive: "docs/archive/",
	}
	return path.startsWith(prefixes[type] ?? "__invalid__")
}

const changed = changedMarkdown()
if (changed.size === 0) {
	console.log("Documentation governance: no Markdown changes to inspect.")
	process.exit(0)
}

const errors = []
const allDocs = markdownFiles(resolve(root, "docs"))
const indexTargets = new Set()
function collectIndexLinks(filePath) {
	if (!existsSync(filePath)) return
	const content = readFileSync(filePath, "utf8")
	for (const link of localLinks(content)) {
		indexTargets.add(normalize(relative(root, resolve(dirname(filePath), link))))
	}
}
for (const indexPath of allDocs.filter((path) => path.endsWith(`${sep}README.md`))) {
	collectIndexLinks(indexPath)
}
for (const entry of ["AGENTS.md", "README.md"]) {
	collectIndexLinks(resolve(root, entry))
}

for (const [path, status] of changed) {
	const absolutePath = resolve(root, path)
	if (!existsSync(absolutePath)) continue
	const content = readFileSync(absolutePath, "utf8")

	for (const link of localLinks(content)) {
		const target = resolve(dirname(absolutePath), link)
		if (!existsSync(target)) errors.push(`${path}: enlace local roto: ${link}`)
	}

	if (!path.startsWith("docs/")) continue

	const basename = path.split("/").at(-1)
	if (/(?:^|[-_])(closeout|session-summary|implementation-report)(?:[-_.]|$)/i.test(basename)) {
		errors.push(`${path}: nombre efímero prohibido; consolida el contenido en la fuente canónica`)
	}

	const size = statSync(absolutePath).size
	if (status === "A" && size > MAX_NEW_BYTES) {
		errors.push(`${path}: documento nuevo de ${size} bytes; el máximo es ${MAX_NEW_BYTES}`)
	}
	if (status !== "A" && size > MAX_NEW_BYTES) {
		const previous = git(["show", `HEAD:${path}`], { allowFailure: true })
		if (previous && size - Buffer.byteLength(previous) > MAX_GROWTH_BYTES) {
			errors.push(
				`${path}: un documento grande creció más de ${MAX_GROWTH_BYTES} bytes; consolida o divide por responsabilidad`
			)
		}
	}

	if (status !== "A") continue

	for (const key of metadataKeys) {
		if (!metadata(content, key)) errors.push(`${path}: falta metadata \`${key}\``)
	}
	const type = metadata(content, "Document type")
	if (type && !documentTypes.has(type)) errors.push(`${path}: Document type inválido: ${type}`)
	if (type && !allowedTypePath(path, type)) {
		errors.push(`${path}: la ubicación no corresponde a Document type: ${type}`)
	}
	const lastVerified = metadata(content, "Last verified")
	if (lastVerified && !/^\d{4}-\d{2}-\d{2}$/.test(lastVerified)) {
		errors.push(`${path}: Last verified debe usar YYYY-MM-DD`)
	}
	if (type !== "index" && !metadata(content, "Related code/tests")) {
		errors.push(`${path}: falta metadata \`Related code/tests\``)
	}
	if (!isIndex(path, content) && !indexTargets.has(normalize(path))) {
		errors.push(`${path}: no está enlazado desde un README.md de documentación`)
	}
}

if (errors.length > 0) {
	console.error("Documentation governance failed:\n")
	for (const error of errors) console.error(`- ${error}`)
	console.error("\nConsulta docs/DOCUMENTATION_POLICY.md antes de crear otro archivo.")
	process.exit(1)
}

console.log(`Documentation governance passed (${changed.size} Markdown file(s) inspected).`)
