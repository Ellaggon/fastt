/** A single effective duration, with an optional provider display label. */
export function experienceDurationLabel(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	return [hours ? `${hours} ${hours === 1 ? "hora" : "horas"}` : "", rest ? `${rest} min` : ""]
		.filter(Boolean)
		.join(" ")
}
export function experienceDurationMinutes(hours: unknown, minutes: unknown): number {
	const h = Number(hours),
		m = Number(minutes)
	return Number.isInteger(h) && h >= 0 && Number.isInteger(m) && m >= 0 && m < 60 ? h * 60 + m : NaN
}
