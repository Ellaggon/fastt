import { z } from "zod"

export const productFormSchema = z.object({
	providerId: z.string().min(1, "providerId requerido"),
	name: z.string().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120"),
	productType: z.enum(["Hotel", "Tour", "Package"], {
		required_error: "Tipo de producto requerido",
	}),
	shortDescription: z.string().max(240, "Máx 240").optional().or(z.literal("")),
	longDescription: z.string().max(5000, "Máx 5000").optional().or(z.literal("")),
	cityId: z.string().min(1, "Selecciona una ciudad"),
	basePriceUSD: z.coerce.number().min(0, "Precio >= 0"),
	basePriceBOB: z.coerce.number().min(0, "Precio >= 0"),
	// imágenes: validamos en cliente con la metadata y en server por seguridad
	imagesMeta: z
		.array(
			z.object({
				name: z.string(),
				size: z.number().max(10 * 1024 * 1024, "Imagen <= 10MB"), // ajusta a tu límite real
				type: z.string().regex(/^image\//, "Debe ser imagen"),
			})
		)
		.min(1, "Sube al menos 1 imagen"),
})

export type ProductForm = z.infer<typeof productFormSchema>
