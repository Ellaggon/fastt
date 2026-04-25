export enum ReasonCode {
	NO_INVENTORY = "NO_INVENTORY",
	MIN_STAY_NOT_MET = "MIN_STAY_NOT_MET",
	CTA_RESTRICTION = "CTA_RESTRICTION",
	CTD_RESTRICTION = "CTD_RESTRICTION",
	POLICY_BLOCKED = "POLICY_BLOCKED",
	PRICE_NOT_AVAILABLE = "PRICE_NOT_AVAILABLE",
	STALE_VIEW = "STALE_VIEW",
	MISSING_COVERAGE = "MISSING_COVERAGE",
}

export type Money = {
	amount: number
	currency: string
}

export type Price = {
	base: Money | null
	display: Money | null
}

export type SearchSellabilityDTO = {
	isSellable: boolean
	reasonCodes: ReasonCode[]
	price: Price
	availability: {
		hasInventory: boolean
		hasRestrictions: boolean
	}
	policies: {
		isCompliant: boolean
	}
	diagnostics?: {
		missingCoverage?: boolean
		staleView?: boolean
	}
}

export function mapPriceToLegacy(price: Price): { total: number | null; currency: string | null } {
	if (!price) return { total: null, currency: null }
	if (price.display) {
		return {
			total: Number(price.display.amount),
			currency: String(price.display.currency),
		}
	}
	if (price.base) {
		return {
			total: Number(price.base.amount),
			currency: String(price.base.currency),
		}
	}
	return { total: null, currency: null }
}
