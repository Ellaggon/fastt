import { expect, test } from "vitest"

import {
	fiscalRatePlanDisplayLabel,
	selectFiscalSimulationDiagnosticPlan,
} from "@/lib/taxes-fees/fiscal-workspace-resources"

test("commercial warnings name the room when two rate plans share Default", () => {
	expect(fiscalRatePlanDisplayLabel("Default", "Suite ejecutiva")).toBe("Default · Suite ejecutiva")
	expect(fiscalRatePlanDisplayLabel("Default", "Suite deluxe")).toBe("Default · Suite deluxe")
	expect(fiscalRatePlanDisplayLabel("Default", "Default")).toBe("Default")
	expect(fiscalRatePlanDisplayLabel("Default", "")).toBe("Default")
})

test("the diagnostic plan is the one closest to a real stay, not the first Default in the list", () => {
	const executive = { id: "default-executive" }
	const deluxe = { id: "default-deluxe" }
	const chosen = selectFiscalSimulationDiagnosticPlan(
		[executive, deluxe],
		new Map([
			["default-executive", 1],
			["default-deluxe", 12],
		])
	)
	expect(chosen?.id).toBe("default-deluxe")
})
