export type TourGalleryLayout = "single" | "two" | "three" | "four" | "five"

export function tourGalleryLayout(imageCount: number): TourGalleryLayout {
	const count = Math.max(0, Math.floor(Number(imageCount) || 0))
	if (count <= 1) return "single"
	if (count === 2) return "two"
	if (count === 3) return "three"
	if (count === 4) return "four"
	return "five"
}
