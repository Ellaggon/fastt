import ts from "typescript"

import { readSource } from "./_guardrail-scanner"

export type ImportBinding = {
	module: string
	imported: string
	local: string
}

export type CallBinding = {
	calleePath: string
	root: string
	leaf: string
}

export type ParsedSource = {
	sourceFile: ts.SourceFile
}

function buildCallPath(node: ts.Expression): string | null {
	if (ts.isIdentifier(node)) return node.text
	if (ts.isPropertyAccessExpression(node)) {
		const left = buildCallPath(node.expression)
		if (!left) return null
		return `${left}.${node.name.text}`
	}
	if (ts.isElementAccessExpression(node)) {
		const left = buildCallPath(node.expression)
		if (!left) return null
		if (ts.isStringLiteral(node.argumentExpression)) {
			return `${left}.${node.argumentExpression.text}`
		}
		return left
	}
	if (ts.isCallExpression(node)) {
		return buildCallPath(node.expression)
	}
	if (ts.isParenthesizedExpression(node)) return buildCallPath(node.expression)
	return null
}

export function parseSource(relativePath: string): ParsedSource {
	const sourceText = readSource(relativePath)
	const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true)
	return { sourceFile }
}

export function collectImports(relativePath: string): ImportBinding[] {
	const { sourceFile } = parseSource(relativePath)
	const imports: ImportBinding[] = []
	sourceFile.forEachChild((node) => {
		if (!ts.isImportDeclaration(node)) return
		if (!ts.isStringLiteral(node.moduleSpecifier)) return
		const module = node.moduleSpecifier.text
		const clause = node.importClause
		if (!clause) return
		if (clause.name) {
			imports.push({
				module,
				imported: "default",
				local: clause.name.text,
			})
		}
		const named = clause.namedBindings
		if (!named) return
		if (ts.isNamespaceImport(named)) {
			imports.push({
				module,
				imported: "*",
				local: named.name.text,
			})
			return
		}
		for (const spec of named.elements) {
			imports.push({
				module,
				imported: spec.propertyName?.text ?? spec.name.text,
				local: spec.name.text,
			})
		}
	})
	return imports
}

export function collectCalls(relativePath: string): CallBinding[] {
	const { sourceFile } = parseSource(relativePath)
	const calls: CallBinding[] = []

	function walk(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const path = buildCallPath(node.expression)
			if (path) {
				const parts = path.split(".")
				calls.push({
					calleePath: path,
					root: parts[0] ?? path,
					leaf: parts[parts.length - 1] ?? path,
				})
			}
		}
		ts.forEachChild(node, walk)
	}

	walk(sourceFile)
	return calls
}

export function collectObjectKeys(relativePath: string): string[] {
	const { sourceFile } = parseSource(relativePath)
	const keys = new Set<string>()

	function walk(node: ts.Node): void {
		if (ts.isPropertyAssignment(node)) {
			if (ts.isIdentifier(node.name)) keys.add(node.name.text)
			else if (ts.isStringLiteral(node.name)) keys.add(node.name.text)
		}
		ts.forEachChild(node, walk)
	}
	walk(sourceFile)
	return [...keys]
}

export function collectStringLiterals(relativePath: string): string[] {
	const { sourceFile } = parseSource(relativePath)
	const literals: string[] = []
	function walk(node: ts.Node): void {
		if (ts.isStringLiteralLike(node)) literals.push(node.text)
		ts.forEachChild(node, walk)
	}
	walk(sourceFile)
	return literals
}

export function collectHttpExportMethods(relativePath: string): Set<string> {
	const { sourceFile } = parseSource(relativePath)
	const methods = new Set<string>()

	sourceFile.forEachChild((node) => {
		if (!ts.isVariableStatement(node)) return
		const isExported = node.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
		)
		if (!isExported) return
		for (const declaration of node.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name)) continue
			const name = declaration.name.text
			if (name === "POST" || name === "PUT" || name === "PATCH" || name === "DELETE") {
				methods.add(name)
			}
		}
	})

	return methods
}
