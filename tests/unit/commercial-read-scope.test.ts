import { expect, it, vi } from "vitest"
import { commercialReadOnce, withCommercialReadScope } from "@/lib/commercial-policy/read-scope"

it("coalesces concurrent reads only inside one scope", async () => {
	const load = vi.fn(async () => ({ value: 1 }))
	await withCommercialReadScope(async () => {
		const [a, b] = await Promise.all([commercialReadOnce("owner:a", load), commercialReadOnce("owner:a", load)])
		expect(a).toBe(b)
	})
	expect(load).toHaveBeenCalledTimes(1)
	await withCommercialReadScope(() => commercialReadOnce("owner:a", load))
	expect(load).toHaveBeenCalledTimes(2)
})

it("isolates overlapping requests and provider identities", async () => {
	let release!: () => void
	const barrier = new Promise<void>((resolve) => { release = resolve })
	const first = withCommercialReadScope(async () => {
		const value = await commercialReadOnce("owner:a", async () => "first")
		await barrier
		expect(await commercialReadOnce("owner:a", async () => "wrong")).toBe(value)
	})
	await withCommercialReadScope(async () => {
		expect(await commercialReadOnce("owner:a", async () => "second")).toBe("second")
		expect(await commercialReadOnce("owner:b", async () => "other")).toBe("other")
	})
	release()
	await first
})

it("does not cache command reads outside a scope or carry failed reads forward", async () => {
	const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("current")
	await expect(withCommercialReadScope(() => commercialReadOnce("a", load))).rejects.toThrow("offline")
	expect(await withCommercialReadScope(() => commercialReadOnce("a", load))).toBe("current")
	await commercialReadOnce("a", load)
	await commercialReadOnce("a", load)
	expect(load).toHaveBeenCalledTimes(4)
})
