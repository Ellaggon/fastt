import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTableName } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	documents: vi.fn(),
	tax: vi.fn(),
	payments: vi.fn(),
	assignments: vi.fn(),
	globalDocuments: vi.fn(),
	globalTax: vi.fn(),
	globalPayments: vi.fn(),
}))
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<object>()),
	db: { select: mocks.select },
}))
vi.mock("@/lib/provider-documents", () => ({
	listProviderDocuments: mocks.documents,
	listPendingProviderDocumentsForAdmin: mocks.globalDocuments,
	listExpiredProviderDocumentsForAdmin: vi.fn(),
	assessExpiredDocumentOperationalImpact: vi.fn(),
}))
vi.mock("@/lib/provider-tax-configuration", () => ({
	getProviderTaxConfiguration: mocks.tax,
	listProviderTaxConfigurationsForAdmin: mocks.globalTax,
}))
vi.mock("@/lib/provider-payment-accounts", () => ({
	listProviderPaymentAccounts: mocks.payments,
	listPendingProviderPaymentAccountsForAdmin: mocks.globalPayments,
}))
vi.mock("@/lib/provider-compliance-ops", () => ({
	listOpenComplianceAssignments: mocks.assignments,
}))
import {
	loadProviderComplianceDetail,
	listRecentProviderComplianceAudit,
} from "@/lib/provider-admin-compliance"

describe("provider compliance detail loading", () => {
	const queries: Array<{ table: string; condition?: unknown; limit?: number }> = []
	beforeEach(() => {
		vi.clearAllMocks()
		queries.length = 0
		mocks.select.mockImplementation(() => {
			const query = {
				table: "",
				condition: undefined as unknown,
				limit: undefined as number | undefined,
			}
			const rows = () =>
				query.table === "Provider"
					? [{ id: "provider-1", displayName: "Hotel", legalName: "Hotel", status: "active" }]
					: query.table === "ProviderVerification"
						? [{ status: "approved", reason: null }]
						: []
			const builder = {
				from(table: Parameters<typeof getTableName>[0]) {
					query.table = getTableName(table)
					queries.push(query)
					return builder
				},
				where(condition: unknown) {
					query.condition = condition
					return builder
				},
				orderBy() {
					return builder
				},
				limit(limit: number) {
					query.limit = limit
					return builder
				},
				then: (...args: Parameters<Promise<unknown[]>["then"]>) =>
					Promise.resolve(rows()).then(...args),
				catch: (...args: Parameters<Promise<unknown[]>["catch"]>) =>
					Promise.resolve(rows()).catch(...args),
			}
			return builder
		})
		mocks.documents.mockResolvedValue([{ id: "doc", status: "verified" }])
		mocks.tax.mockResolvedValue({ providerId: "provider-1", status: "verified" })
		mocks.payments.mockResolvedValue([{ id: "account", status: "pending" }])
		mocks.assignments.mockResolvedValue([])
	})

	it("reads only the focused provider without rebuilding every global queue", async () => {
		const detail = await loadProviderComplianceDetail("provider-1")
		expect(detail?.pending).toEqual({ verification: false, fiscal: 0, documents: 0, payments: 1 })
		expect(detail?.checklist.find((item) => item.id === "documents")?.complete).toBe(true)
		expect(detail?.payments[0].id).toBe("account")
		for (const read of [mocks.documents, mocks.tax, mocks.payments])
			expect(read).toHaveBeenCalledExactlyOnceWith("provider-1")
		expect(mocks.assignments).toHaveBeenCalledExactlyOnceWith({ providerId: "provider-1" })
		for (const read of [mocks.globalDocuments, mocks.globalTax, mocks.globalPayments])
			expect(read).not.toHaveBeenCalled()
		expect(queries.every((query) => query.condition)).toBe(true)
	})

	it("filters provider and compliance actions before limiting the audit query", async () => {
		await listRecentProviderComplianceAudit({ providerId: "provider-1", limit: 20 })
		const query = queries.find((item) => item.table === "ProviderAuditLog")!
		expect(query.limit).toBe(20)
		const compiled = new PgDialect().sqlToQuery(
			query.condition as Parameters<PgDialect["sqlToQuery"]>[0]
		)
		expect(compiled.sql).toContain('"ProviderAuditLog"."providerId"')
		expect(compiled.params).toContain("provider-1")
		expect(compiled.params).toContain("provider.payment_account.")
	})

	it("keeps verified but expired evidence in the attention list", async () => {
		mocks.documents.mockResolvedValue([
			{ id: "expired", status: "verified", expiresAt: new Date("2020-01-01"), scopes: [] },
		])
		const detail = await loadProviderComplianceDetail("provider-1")
		expect(detail?.pending.documents).toBe(1)
		expect(detail?.documents[0].isExpiredEvidence).toBe(true)
		expect(detail?.checklist.find((item) => item.id === "documents")?.complete).toBe(false)
	})
})
