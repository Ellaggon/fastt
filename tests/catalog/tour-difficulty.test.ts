import { describe, expect, it } from "vitest"
import {
	canonicalizeTourDifficultyForStorage,
	normalizeTourDifficulty,
	tourDifficultyLabel,
	tourDifficultyMatchValues,
} from "@/lib/tours/tourDifficulty"

describe("tour difficulty canonicalization (P0A)", () => {
	it("maps Spanish UI labels and accented aliases to easy|moderate|hard", () => {
		expect(normalizeTourDifficulty("Fácil")).toBe("easy")
		expect(normalizeTourDifficulty("facil")).toBe("easy")
		expect(normalizeTourDifficulty("Moderado")).toBe("moderate")
		expect(normalizeTourDifficulty("medium")).toBe("moderate")
		expect(normalizeTourDifficulty("Difícil")).toBe("hard")
		expect(normalizeTourDifficulty("dificil")).toBe("hard")
		expect(normalizeTourDifficulty("hard")).toBe("hard")
	})

	it("returns null for empty or unknown free text", () => {
		expect(normalizeTourDifficulty("")).toBeNull()
		expect(normalizeTourDifficulty("   ")).toBeNull()
		expect(normalizeTourDifficulty("extremo")).toBeNull()
		expect(canonicalizeTourDifficultyForStorage("extremo")).toBeNull()
	})

	it("exposes Spanish labels for display", () => {
		expect(tourDifficultyLabel("easy")).toBe("Fácil")
		expect(tourDifficultyLabel("moderate")).toBe("Moderado")
		expect(tourDifficultyLabel("hard")).toBe("Difícil")
		expect(tourDifficultyLabel("Facil")).toBe("Fácil")
	})

	it("includes legacy Spanish values in SQL matchers", () => {
		expect(tourDifficultyMatchValues("easy")).toEqual(
			expect.arrayContaining(["easy", "facil", "fácil"])
		)
		expect(tourDifficultyMatchValues("hard")).toEqual(
			expect.arrayContaining(["hard", "dificil", "difícil"])
		)
	})
})
