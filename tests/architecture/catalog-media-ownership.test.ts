import { expect, it } from "vitest"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()

async function source(relativePath: string) {
	return readFile(path.join(root, relativePath), "utf8")
}

async function readSourceTree(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = await Promise.all(
		entries.map(async (entry) => {
			const absolute = path.join(directory, entry.name)
			if (entry.isDirectory()) return readSourceTree(absolute)
			if (!/\.(ts|tsx|astro)$/.test(entry.name)) return []
			return [await readFile(absolute, "utf8")]
		})
	)
	return files.flat()
}

it("models catalog image ownership through typed relations only", async () => {
	const [tables, baseline, migration] = await Promise.all([
		source("src/shared/infrastructure/db/schema/tables.ts"),
		source("db/postgres/0001_initial_schema.sql"),
		source("db/migrations/2026-09-27_normalize_catalog_image_ownership.sql"),
	])
	const imageDeclaration = tables.slice(
		tables.indexOf('export const Image = pgTable('),
		tables.indexOf('export const ImageUpload = pgTable(')
	)
	const baselineImageDeclaration = baseline.slice(
		baseline.indexOf('CREATE TABLE "Image"'),
		baseline.indexOf('CREATE TABLE "ImageUpload"')
	)

	expect(tables).toContain('export const ProductImage = pgTable(')
	expect(tables).toContain('export const VariantImage = pgTable(')
	expect(imageDeclaration).not.toContain('entityType:')
	expect(imageDeclaration).not.toContain('entityId:')
	expect(baseline).toContain('CREATE TABLE "ProductImage"')
	expect(baseline).toContain('CREATE TABLE "VariantImage"')
	expect(baselineImageDeclaration).not.toContain('"entityType"')
	expect(baselineImageDeclaration).not.toContain('"entityId"')
	expect(migration).toContain('DROP COLUMN "entityType"')
	expect(migration).toContain('DROP COLUMN "entityId"')
})

it("does not retain case-tolerant Product or Variant image reads", async () => {
	const content = (await readSourceTree(path.join(root, "src"))).join("\n")
	expect(content).not.toMatch(/\bImage\.(entityType|entityId|order|isPrimary)/)
	expect(content).not.toContain('["product", "Product"]')
	expect(content).not.toContain('["variant", "Variant"]')
})
