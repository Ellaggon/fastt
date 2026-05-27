export type PricingExtensionOperationType =
	| "fixed_override"
	| "percentage_markup"
	| "percentage_discount"
	| "fixed_adjustment"

export type PricingExtensionOperationOption = {
	value: PricingExtensionOperationType
	label: string
	help: string
	valueLabel: string
	defaultValue: number
	min?: number
	step: string
}

export const pricingExtensionOperationOptions: PricingExtensionOperationOption[] = [
	{
		value: "fixed_override",
		label: "Cambio manual de precio",
		help: "Define el precio final para las fechas seleccionadas.",
		valueLabel: "Precio final",
		defaultValue: 0,
		min: 0,
		step: "1",
	},
]

export function pricingExtensionOperationLabel(value: string | null | undefined): string {
	return (
		pricingExtensionOperationOptions.find((option) => option.value === value)?.label ??
		pricingExtensionOperationOptions[0].label
	)
}
