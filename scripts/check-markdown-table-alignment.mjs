#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const args = process.argv.slice(2)
const fix = args.includes("--fix")
const staged = args.includes("--staged")
const explicit = args.filter((arg) => !arg.startsWith("--"))

function git(commandArgs, { allowFailure = false } = {}) {
	const result = spawnSync("git", commandArgs, { cwd: root, encoding: "utf8" })
	if (result.status !== 0 && !allowFailure) {
		process.stderr.write(result.stderr || `git ${commandArgs.join(" ")} failed\n`)
		process.exit(2)
	}
	return result.stdout.trim()
}

function markdownFiles(directory) {
	if (!existsSync(directory)) return []
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...markdownFiles(path))
		else if (entry.name.endsWith(".md")) files.push(path)
	}
	return files
}

function changedMarkdownPaths() {
	const fromGit = (commandArgs) =>
		git(commandArgs)
			.split("\n")
			.filter((path) => path.startsWith("docs/") && path.endsWith(".md"))

	if (staged) return fromGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--", "docs/**/*.md"])
	return fromGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", "docs/**/*.md"])
}

function targetFiles() {
	if (explicit.length > 0) return explicit.map((file) => resolve(root, file))
	return changedMarkdownPaths().map((file) => resolve(root, file))
}

function isTableRow(line) {
	const trimmed = line.trim()
	return trimmed.startsWith("|") && trimmed.endsWith("|")
}

function pipeColumns(line) {
	return [...line.matchAll(/\|/g)].map((match) => match.index)
}

function parseTableRow(line) {
	return line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim())
}

function isSeparatorRow(cells) {
	return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function formatTableBlock(lines) {
	const parsed = lines.map(parseTableRow)
	if (parsed.length < 2 || !isSeparatorRow(parsed[1])) return lines

	const header = parsed[0]
	const data = parsed.slice(2)
	const colWidths = header.map((_, columnIndex) =>
		Math.max(...parsed.map((row) => (row[columnIndex] ?? "").length))
	)

	const formatRow = (cells) =>
		`| ${cells.map((cell, index) => cell.padEnd(colWidths[index])).join(" | ")} |`
	const separator = formatRow(colWidths.map((width) => "-".repeat(width)))

	return [formatRow(header), separator, ...data.map((row) => formatRow(row))]
}

function usesAlignedStyle(lines) {
	if (lines.length < 2) return false
	const header = pipeColumns(lines[0])
	const separator = pipeColumns(lines[1])
	if (header.length !== separator.length) return false
	for (let index = 0; index < header.length; index += 1) {
		if (header[index] !== separator[index]) return false
	}
	return isSeparatorRow(parseTableRow(lines[1]))
}

function validateTable(lines, filePath, startLineNumber) {
	if (!usesAlignedStyle(lines)) return []

	const expected = pipeColumns(lines[0])
	const errors = []

	for (let index = 1; index < lines.length; index += 1) {
		const columns = pipeColumns(lines[index])
		if (columns.length !== expected.length) {
			errors.push(
				`${filePath}:${startLineNumber + index}: table row has ${columns.length} columns; expected ${expected.length} (MD060)`
			)
			continue
		}
		for (let column = 0; column < expected.length; column += 1) {
			if (columns[column] !== expected[column]) {
				errors.push(
					`${filePath}:${startLineNumber + index}: pipe column ${column + 1} misaligned (expected column ${expected[column] + 1}, got ${columns[column] + 1}; MD060 aligned)`
				)
				break
			}
		}
	}

	return errors
}

function processFile(filePath) {
	const content = readFileSync(filePath, "utf8")
	const lines = content.split("\n")
	const errors = []
	const replacements = []

	for (let index = 0; index < lines.length; ) {
		if (!isTableRow(lines[index])) {
			index += 1
			continue
		}

		const start = index
		while (index < lines.length && isTableRow(lines[index])) index += 1
		const block = lines.slice(start, index)
		errors.push(...validateTable(block, relative(root, filePath), start + 1))

		if (fix && usesAlignedStyle(block)) {
			replacements.push({ start, end: index, formatted: formatTableBlock(block) })
		}
	}

	if (!fix || replacements.length === 0) return errors

	let nextLines = [...lines]
	for (const replacement of replacements.reverse()) {
		nextLines.splice(
			replacement.start,
			replacement.end - replacement.start,
			...replacement.formatted
		)
	}
	writeFileSync(filePath, `${nextLines.join("\n")}\n`)
	return errors
}

const files = targetFiles().filter((file) => existsSync(file))
const errors = files.flatMap((file) => processFile(file))

if (errors.length > 0 && !fix) {
	console.error("Markdown table alignment failed:\n")
	for (const error of errors) console.error(`- ${error}`)
	console.error(
		"\nAlign pipes with the header row (MD060) or run: pnpm run format:docs:tables -- --fix <files>"
	)
	process.exit(1)
}

if (fix && errors.length > 0) {
	console.log(`Aligned tables in ${files.length} file(s); re-run check to verify.`)
	process.exit(0)
}

console.log(`Markdown table alignment passed (${files.length} file(s)).`)
