import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
const args = process.argv.slice(2)
const mode =
	args.find((arg) => arg === "--changed" || arg === "--all" || arg === "--staged") ?? "--all"
const explicitFiles = args.filter((arg) => !arg.startsWith("--"))

function gitFiles(command) {
	return execSync(command, { encoding: "utf8" }).split("\n").filter(Boolean)
}

const files =
	explicitFiles.length > 0
		? explicitFiles
		: mode === "--all"
			? gitFiles("git ls-files src")
			: gitFiles(
					mode === "--changed"
						? "git diff --name-only --diff-filter=ACMRT HEAD"
						: "git diff --cached --name-only --diff-filter=ACMRT"
				)

const targetFiles = files
	.map((file) => file.replaceAll("\\", "/"))
	.filter(
		(file) =>
			file.startsWith("src/") &&
			(file.endsWith(".astro") || file.endsWith(".tsx") || file.endsWith(".jsx")) &&
			!file.startsWith("src/components/ui/") &&
			!file.startsWith("src/components/ui-react/")
	)

const legacyCardSurfaceFiles = new Set([
	"src/components/dashboard/DashboardTopBar.astro",
	"src/components/dashboard/ProfessionalModeToggle.astro",
	"src/components/financial/FinancialPlaceholderPage.astro",
	"src/components/financial/FinancialSubnav.astro",
	"src/components/financial/FinancialUnifiedWorkspace.astro",
	"src/components/financial/FinancialWorkspaceShell.astro",
	"src/components/nav/NavBurger.astro",
	"src/components/policy/PolicyAssignmentFlow.astro",
	"src/components/productUI/RoomModal.astro",
	"src/components/rates/MaterializationFreshnessStrip.astro",
	"src/components/rates/RatePlanActionMenu.astro",
	"src/pages/dashboard/index.astro",
	"src/layouts/WorkspaceLayout.astro",
	"src/pages/SignInPage/index.astro",
	"src/pages/admin/product-review/[id].astro",
	"src/pages/auth/callback.astro",
	"src/pages/catalog/accommodations/rooms/index.astro",
	"src/pages/hotels/[id]/index.astro",
	"src/pages/product/[id]/content.astro",
	"src/pages/product/[id]/images.astro",
	"src/pages/product/[id]/index.astro",
	"src/pages/product/[id]/location.astro",
	"src/pages/product/[id]/preview.astro",
	"src/pages/product/[id]/rooms.astro",
	"src/pages/product/[id]/rooms/[roomId]/index.astro",
	"src/pages/product/[id]/rooms/[roomId]/profile.astro",
	"src/pages/product/[id]/rooms/new.astro",
	"src/pages/product/[id]/subtype.astro",
	"src/pages/product/create.astro",
	"src/pages/provider/house-rules.astro",
	"src/pages/provider/index.astro",
	"src/pages/provider/tax-fees/index.astro",
	"src/pages/rates/multi-calendar.astro",
	"src/pages/rates/plans/[ratePlanId].astro",
	"src/pages/tours/[id]/index.astro",
	"src/components/rooms/RoomProfileEditor.astro",
	"src/components/rates/MultiCalendarWorkspace.tsx",
	"src/components/rates/SingleCalendarWorkspace.tsx",
])

const legacyInteractiveFiles = new Set([
	"src/components/nav/NavBurger.astro",
	"src/components/pricing/RatePlansSection.astro",
	"src/components/productUI/GuestRoomPreviewCards.astro",
	"src/components/productUI/MapModal.astro",
	"src/components/productUI/RoomModal.astro",
	"src/components/productUI/RoomSection.astro",
	"src/components/rates/CalendarResponsiveDrawer.tsx",
	"src/components/rates/MultiCalendarWorkspace.tsx",
	"src/components/rooms/RoomProfileEditor.astro",
	"src/components/searchPanel/TourSearchPanel.astro",
	"src/pages/SignInPage/index.astro",
	"src/pages/hotels/[id]/index.astro",
	"src/pages/provider/house-rules.astro",
	"src/pages/provider/index.astro",
	"src/pages/rates/plans/[ratePlanId].astro",
	"src/pages/rates/plans/manage.astro",
	"src/pages/tours/[id]/index.astro",
])

const legacyModalSurfaceFiles = new Set([
	"src/components/MapPicker.astro",
	"src/components/financial/FinancialUnifiedWorkspace.astro",
	"src/pages/tours/[id]/index.astro",
])

const wrapperSurfaceFiles = [
	/Modal\.(astro|tsx|jsx)$/,
	/Drawer\.(astro|tsx|jsx)$/,
	/src\/components\/productUI\/RoomSection\.astro$/,
	/src\/components\/productUI\/GuestRoomPreviewCards\.astro$/,
	/src\/components\/policy\/PolicyAssignmentFlow\.astro$/,
	/src\/components\/rates\/CalendarResponsiveDrawer\.tsx$/,
]

const allowedClassTokens = {
	button: ["fastt-button", "calendar-control"],
	input: ["fastt-field", "fastt-check-input", "calendar-control"],
	select: ["fastt-field", "calendar-control"],
	textarea: ["fastt-field", "calendar-control"],
	dialog: ["fastt-dialog"],
	card: ["fastt-card", "fastt-row-card", "fastt-soft-box", "fastt-notice", "fastt-empty-state"],
	modal: ["fastt-modal-backdrop", "modal-overlay", "calendar-backdrop"],
}

const legacyColorPattern =
	/\b(?:airbnb-|bg-blue-|text-blue-|border-blue-|bg-purple-|text-purple-|border-purple-)/

function lineNumberForIndex(source, index) {
	return source.slice(0, index).split("\n").length
}

function getAttribute(tag, name) {
	const match = tag.match(new RegExp(`\\b${name}(?:Name)?\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
	return match?.[1] ?? match?.[2] ?? ""
}

function classHasAny(classValue, tokens) {
	return tokens.some((token) => classValue.includes(token))
}

function isAllowedNativeInput(tag) {
	const type = (tag.match(/\btype\s*=\s*["']([^"']+)["']/)?.[1] ?? "").toLowerCase()
	if (type === "hidden") return true
	if (type === "file" && getAttribute(tag, "class").includes("hidden")) return true
	return false
}

function isWrapperSurface(file) {
	return wrapperSurfaceFiles.some((pattern) => pattern.test(file))
}

function collectTags(source, tagName) {
	const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?>`, "g")
	return Array.from(source.matchAll(pattern), (match) => ({
		tag: match[0],
		index: match.index ?? 0,
	}))
}

function collectClassLikeAssignments(source) {
	const pattern = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g
	return Array.from(source.matchAll(pattern), (match) => ({
		value: match[1] ?? match[2] ?? match[3] ?? "",
		index: match.index ?? 0,
	}))
}

const violations = []

for (const file of targetFiles) {
	const source = readFileSync(file, "utf8")
	const allowWrapperSurface = isWrapperSurface(file)
	const allowLegacyCards = legacyCardSurfaceFiles.has(file)
	const allowLegacyInteractive = legacyInteractiveFiles.has(file)
	const allowLegacyModal = legacyModalSurfaceFiles.has(file)

	for (const [index, line] of source.split("\n").entries()) {
		if (legacyColorPattern.test(line)) {
			violations.push(`${file}:${index + 1} legacy external color token`)
		}
	}

	for (const tagName of ["button", "input", "select", "textarea"]) {
		if (allowLegacyInteractive) continue
		for (const { tag, index } of collectTags(source, tagName)) {
			const classValue = getAttribute(tag, "class")
			if (!classValue) continue
			if (tagName === "input" && isAllowedNativeInput(tag)) continue
			if (classHasAny(classValue, allowedClassTokens[tagName])) continue
			violations.push(
				`${file}:${lineNumberForIndex(source, index)} raw ${tagName} class; use ui/* or fastt-*`
			)
		}
	}

	for (const { tag, index } of collectTags(source, "dialog")) {
		const classValue = getAttribute(tag, "class")
		if (classHasAny(classValue, allowedClassTokens.dialog)) continue
		violations.push(`${file}:${lineNumberForIndex(source, index)} raw dialog; use Dialog`)
	}

	for (const { value, index } of collectClassLikeAssignments(source)) {
		if (/\bfixed\b/.test(value) && /\binset-0\b/.test(value) && !allowWrapperSurface) {
			if (!allowLegacyModal && !classHasAny(value, allowedClassTokens.modal)) {
				violations.push(
					`${file}:${lineNumberForIndex(source, index)} raw modal surface; use Dialog/Drawer`
				)
			}
		}

		if (allowLegacyCards) continue
		if (!/\brounded(?:-|\[)/.test(value) || !/\bborder\b/.test(value) || !/\bbg-/.test(value)) {
			continue
		}
		if (classHasAny(value, allowedClassTokens.card)) continue
		if (classHasAny(value, allowedClassTokens.button)) continue
		violations.push(
			`${file}:${lineNumberForIndex(source, index)} raw card/panel class; use Card/Notice/EmptyState or fastt-*`
		)
	}
}

if (violations.length > 0) {
	console.error("UI guardrail failed. Use src/components/ui/* or shared fastt-* primitives.")
	console.error("")
	console.error(violations.join("\n"))
	console.error("")
	console.error(`Checked ${targetFiles.length} file(s) in ${mode} mode.`)
	process.exit(1)
}

console.log(
	targetFiles.length
		? `UI guardrail passed (${targetFiles.length} file(s), ${mode} mode).`
		: "UI guardrail skipped: no matching files."
)
