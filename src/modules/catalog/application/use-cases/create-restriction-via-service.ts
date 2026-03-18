import { restrictionService } from "@/container"

export async function createRestrictionViaService(body: any): Promise<Response> {
	await restrictionService.create(body)
	return new Response("ok")
}
