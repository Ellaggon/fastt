export interface CreateRatePlanCommand {
	template: {
		id: string
		name: string
		description: string | null
		/** @deprecated UI/package hint only. Contractual payment terms live in CAPA 6 policies. */
		paymentType: string
		/** @deprecated UI/package hint only. Contractual refund terms live in CAPA 6 policies. */
		refundable: boolean
		createdAt: Date
	}
	ratePlan: {
		id: string
		variantId: string
		templateId: string
		isDefault?: boolean
		isActive: boolean
		createdAt: Date
	}
	priceRule?: {
		id: string
		ratePlanId: string
		name: string | null
		type: string
		value: number
		priority: number
		isActive: boolean
		createdAt: Date
	}
	restrictions: Array<{
		id: string
		scope: "rate_plan"
		scopeId: string
		type: string
		value: number
		startDate: string
		endDate: string
		validDays: unknown | null
		isActive: boolean
	}>
}

export interface RatePlanCommandRepositoryPort {
	createRatePlan(cmd: CreateRatePlanCommand): Promise<void>
	updateRatePlan(params: {
		ratePlanId: string
		isActive: boolean
		template: {
			name: string
			description: string | null
			/** @deprecated UI/package hint only. Contractual payment terms live in CAPA 6 policies. */
			paymentType: string
			/** @deprecated UI/package hint only. Contractual refund terms live in CAPA 6 policies. */
			refundable: boolean
		}
		priceRule: null | {
			id: string
			ratePlanId: string
			name: string | null
			type: string
			value: number
			priority: number
			isActive: boolean
			createdAt: Date
		}
		restrictions: Array<{ type: string; value: number }>
	}): Promise<"not_found" | "ok">
	deleteRatePlan(ratePlanId: string): Promise<"not_found" | "ok">
}
