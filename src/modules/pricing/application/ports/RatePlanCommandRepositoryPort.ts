export interface CreateRatePlanCommand {
	template: {
		id: string
		name: string
		description: string | null
		paymentType: string
		refundable: boolean
		cancellationPolicyId: string | null
		createdAt: Date
	}
	ratePlan: {
		id: string
		variantId: string
		templateId: string
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
			paymentType: string
			refundable: boolean
			cancellationPolicyId: string | null
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
