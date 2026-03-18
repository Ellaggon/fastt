import { restrictionService } from "@/container"

export async function previewRestrictionsViaService(params: {
	productId: string
	body: any
}): Promise<Response> {
	const { productId, body } = params

	const preview = await restrictionService.preview(
		{
			productId,
			checkIn: new Date(),
			checkOut: new Date(),
			nights: 1,
		},
		body
	)

	return new Response(JSON.stringify(preview), { status: 200 })
}
