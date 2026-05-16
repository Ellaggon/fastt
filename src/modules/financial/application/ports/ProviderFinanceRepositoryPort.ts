import type { CommissionSnapshot } from "../../domain/commission-snapshot"
import type { PayoutRecord } from "../../domain/payout-record"
import type { ProviderFinancialProfile } from "../../domain/provider-financial-profile"
import type { ProviderPayableSnapshot } from "../../domain/provider-payable-snapshot"
import type { ProviderStatement } from "../../domain/provider-statement"

export type ProviderFinancialProfileCreateInput = Omit<
	ProviderFinancialProfile,
	"createdAt" | "updatedAt"
>
export type CommissionSnapshotCreateInput = Omit<CommissionSnapshot, "id" | "createdAt"> & {
	id?: string
}
export type ProviderPayableSnapshotCreateInput = Omit<
	ProviderPayableSnapshot,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string
}
export type PayoutRecordCreateInput = Omit<PayoutRecord, "id" | "createdAt" | "updatedAt"> & {
	id?: string
}
export type ProviderStatementCreateInput = Omit<
	ProviderStatement,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string
}

export type ProviderFinancialProfileRepositoryPort = {
	findByProviderId(providerId: string): Promise<ProviderFinancialProfile | null>
	upsert(input: ProviderFinancialProfileCreateInput): Promise<ProviderFinancialProfile>
}

export type CommissionSnapshotRepositoryPort = {
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<CommissionSnapshot[]>
	createIfAbsent(input: CommissionSnapshotCreateInput): Promise<{
		snapshot: CommissionSnapshot
		created: boolean
	}>
}

export type ProviderPayableSnapshotRepositoryPort = {
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<ProviderPayableSnapshot[]>
	createIfAbsent(input: ProviderPayableSnapshotCreateInput): Promise<{
		snapshot: ProviderPayableSnapshot
		created: boolean
	}>
}

export type PayoutRecordRepositoryPort = {
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<PayoutRecord[]>
	createIfAbsent(
		input: PayoutRecordCreateInput
	): Promise<{ record: PayoutRecord; created: boolean }>
}

export type ProviderStatementRepositoryPort = {
	findByProvider(params: {
		providerId: string
		status?: ProviderStatement["status"] | "all"
		limit?: number
	}): Promise<ProviderStatement[]>
	createIfAbsent(input: ProviderStatementCreateInput): Promise<{
		statement: ProviderStatement
		created: boolean
	}>
}
