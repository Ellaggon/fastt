import fs from "node:fs"
import { pathToFileURL } from "node:url"
import { parse } from "dotenv"

const services = [
	["vercel", "application-hosting-and-cron", []],
	["github", "source-ci-and-artifacts", []],
	["render", "optional-hosted-document-processing", []],
	["domains", "dns-and-domain-renewal", []],
	["supabase-db", "data", ["DATABASE_URL", "SUPABASE_DB_POOLER_URL"]],
	["supabase-auth", "authentication", ["SUPABASE_URL", "SUPABASE_ANON_KEY"]],
	["upstash", "cache-and-rollout", ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]],
	["redis", "cache-and-rollout", ["REDIS_URL"]],
	["r2-assets", "public-assets", ["R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]],
	[
		"r2-documents",
		"private-documents",
		["R2_DOCUMENTS_BUCKET_NAME", "R2_DOCUMENTS_ACCESS_KEY_ID", "R2_DOCUMENTS_SECRET_ACCESS_KEY"],
	],
	[
		"document-gateway",
		"document-inspection",
		["DOCUMENT_ANALYSIS_GATEWAY_URL", "DOCUMENT_ANALYSIS_GATEWAY_TOKEN"],
	],
	["document-dispatcher", "document-scheduling", ["DOCUMENT_PROCESSING_WORKER_TOKEN"]],
	["resend", "email", ["RESEND_API_KEY"]],
	["channex-sandbox", "channel-manager", ["CHANNEX_STAGING_API_KEY"]],
	["stripe", "payout-verification", ["STRIPE_SECRET_KEY"]],
	["identity-vendor", "identity", ["IDENTITY_VENDOR_API_KEY"]],
	["tax-bureau", "tax-verification", ["TIN_BUREAU_API_KEY"]],
	["ai", "optional-ai", ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]],
]

const environments = ["development", "test", "staging", "production", "shared"]
const isLabel = (value) => typeof value === "string" && /^[a-zA-Z0-9 ._-]{1,100}$/.test(value)
const validDate = (value) =>
	typeof value === "string" &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	Number.isFinite(Date.parse(value)) &&
	new Date(value).toISOString().slice(0, 10) === value

export function reconcile(rows, evidence, now = new Date()) {
	if (!Array.isArray(evidence)) throw new Error("billing_evidence_must_be_array")
	const allowed = new Set([
		"service",
		"resource",
		"environment",
		"plan",
		"owner",
		"currency",
		"monthlyFixed",
		"variableAccrued",
		"periodStart",
		"periodEnd",
		"verifiedAt",
		"renewal",
		"quotaUsed",
		"quotaLimit",
		"source",
		"consumers",
	])
	const seen = new Set()
	const resources = evidence.map((item) => {
		if (!item || typeof item !== "object" || Object.keys(item).some((key) => !allowed.has(key)))
			throw new Error("invalid_billing_fields")
		if (
			!services.some(([name]) => name === item.service) ||
			!environments.includes(item.environment)
		)
			throw new Error("invalid_service_or_environment")
		for (const key of ["resource", "plan", "owner", "source"]) {
			// Only human labels, never credentials, URLs, account IDs or raw panel exports.
			if (!isLabel(item[key])) throw new Error("invalid_billing_label")
		}
		const consumers = item.consumers === undefined ? [] : item.consumers
		if (
			!Array.isArray(consumers) ||
			consumers.some(
				(link) =>
					!link ||
					typeof link !== "object" ||
					Object.keys(link).some((key) => !["component", "environment", "source"].includes(key)) ||
					!isLabel(link.component) ||
					!isLabel(link.source) ||
					!environments.includes(link.environment) ||
					link.environment === "shared" ||
					(item.environment !== "shared" && link.environment !== item.environment)
			)
		)
			throw new Error("invalid_consumer_evidence")
		if (!/^[A-Z]{3}$/.test(item.currency)) throw new Error("invalid_currency")
		for (const key of ["monthlyFixed", "variableAccrued", "quotaUsed", "quotaLimit"]) {
			if (
				item[key] !== null &&
				(typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < 0)
			)
				throw new Error("invalid_billing_number")
		}
		for (const key of ["verifiedAt", "periodStart", "periodEnd"]) {
			if (!validDate(item[key])) throw new Error("invalid_billing_date")
		}
		if (
			Date.parse(item.periodStart) > Date.parse(item.periodEnd) ||
			Date.parse(item.verifiedAt) > now.getTime()
		)
			throw new Error("invalid_billing_period")
		if (item.renewal !== null && !validDate(item.renewal)) throw new Error("invalid_renewal")
		const id = `${item.service}:${item.environment}:${item.resource}`
		if (seen.has(id)) throw new Error("duplicate_billing_resource")
		seen.add(id)
		const ageDays = (now.getTime() - Date.parse(item.verifiedAt)) / 86400000
		const daysToRenewal =
			item.renewal === null ? null : (Date.parse(item.renewal) - now.getTime()) / 86400000
		return {
			...item,
			consumers,
			stale: ageDays > 7,
			quotaWarning:
				item.quotaLimit !== null &&
				item.quotaUsed !== null &&
				item.quotaUsed >= item.quotaLimit * 0.7,
			renewalWarning: daysToRenewal !== null && daysToRenewal <= 14,
			consumer: rows.some(
				(row) =>
					row.service === item.service &&
					row.environment === item.environment &&
					row.presentFields > 0
			)
				? "same-profile-config-resource-unverified"
				: "investigate-no-local-configuration",
		}
	})
	const totals = {}
	for (const item of resources.filter((item) => !item.stale)) {
		const total = (totals[item.currency] ??= {
			confirmedMonthlyFixed: null,
			unknownFixedResources: 0,
			variableAccruedByPeriod: {},
		})
		if (item.monthlyFixed === null) total.unknownFixedResources++
		else total.confirmedMonthlyFixed = (total.confirmedMonthlyFixed ?? 0) + item.monthlyFixed
		const period = `${item.periodStart}/${item.periodEnd}`
		const usage = (total.variableAccruedByPeriod[period] ??= {
			confirmed: null,
			unknownResources: 0,
		})
		if (item.variableAccrued === null) usage.unknownResources++
		else usage.confirmed = (usage.confirmed ?? 0) + item.variableAccrued
	}
	return {
		resources,
		totals,
		unverifiedServices: [
			...new Set(
				rows
					.filter((row) => !resources.some((item) => item.service === row.service && !item.stale))
					.map((row) => row.service)
			),
		],
		complete: false,
		closure: "requires-account-and-resource-review",
		unlinkedConfigurations: rows
			.filter((row) => row.presentFields > 0)
			.map(({ service, environment }) => ({ service, environment })),
		note: "Partial evidence only. No extrapolation, taxes or currency conversion. Shared invoices must not be repeated per consumer.",
	}
}

// Deliberately report presence only: no URLs, identifiers, secrets or network probes.
export function inventory(env, environment = "unverified") {
	return services.map(([service, purpose, keys]) => ({
		service,
		purpose,
		environment,
		presentFields: (environment === "test" && service === "supabase-db"
			? ["FASTT_TEST_DATABASE_URL", "FASTT_TEST_DIRECT_URL"]
			: keys
		).filter((key) => Boolean(env[key]?.trim())).length,
		expectedFields: keys.length,
		deployment: "unverified",
		billing: "unknown",
		fixedCost: null,
		variableUsageCost: null,
		renewal: null,
	}))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2)
	if (args.length && (args.length !== 2 || args[0] !== "--billing"))
		throw new Error("usage: node scripts/service-inventory.mjs [--billing private-evidence.json]")
	const sources = [".env", ".env.test"].map((file) => ({
		file,
		exists: fs.existsSync(file),
		services: inventory(
			fs.existsSync(file) ? parse(fs.readFileSync(file)) : {},
			file === ".env.test" ? "test" : "development"
		),
	}))
	let billing
	try {
		const evidence = args.length ? JSON.parse(fs.readFileSync(args[1], "utf8")) : []
		billing = reconcile(
			sources.flatMap((source) => source.services),
			evidence
		)
	} catch {
		console.error("Invalid billing evidence. No input values were printed.")
		process.exit(1)
	}
	console.log(
		JSON.stringify(
			{
				observedAt: new Date().toISOString(),
				scope: "local-files-and-manually-verified-evidence",
				sources,
				billing,
			},
			null,
			2
		)
	)
}
