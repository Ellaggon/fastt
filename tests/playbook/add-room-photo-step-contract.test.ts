import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("guided room photos step", () => {
	it("owns its continuation and cannot bypass the required gallery", () => {
		const page = source("src/pages/product/[id]/rooms/[roomId]/index.astro")

		expect(page).toContain("hideFooter: isRoomPhotosPlaybook")
		expect(page).toContain("continueHref: isRoomPhotosPlaybook ? null : addRoomContinueHref")
		expect(page).toContain("Guardar y continuar →")
		expect(page).toContain(
			"if (addRoomPlaybookActive && roomImages.length > 0 && roomPhotosContinueHref)"
		)
		expect(page).toContain("!isRoomPhotosPlaybook")
		expect(page).toContain("Guardar galería")
	})

	it("keeps the accommodation fixed and returns to the persisted room profile", () => {
		const page = source("src/pages/product/[id]/rooms/[roomId]/index.astro")

		expect(page).toContain("getPreviousAddRoomStep")
		expect(page).toContain("addRoomPreviousHref")
		expect(page).not.toContain("ProductContextSwitcher")
	})

	it("shows immediate upload feedback for room photo uploads", () => {
		const page = source("src/pages/product/[id]/rooms/[roomId]/index.astro")

		expect(page).toContain('aria-live="polite"')
		expect(page).toContain("uploadJobs")
		expect(page).toContain("createUploadOverlay")
		expect(page).toContain("Subiendo ${completed + 1} de ${batch.length}")
		expect(page).toContain("dataset.uploadState = job.state")
	})

	it("stores physical units without implicitly opening calendar dates", () => {
		const profileApi = source("src/pages/api/variant/room-profile.ts")
		const createVariant = source(
			"src/modules/catalog/application/use-cases/variant/create-variant.ts"
		)

		expect(profileApi).toContain("bootstrapInventory: false")
		expect(profileApi).not.toContain("inventoryBootstrapper.bootstrapVariantInventory")
		expect(createVariant).toContain("params.bootstrapInventory !== false")
	})
})
