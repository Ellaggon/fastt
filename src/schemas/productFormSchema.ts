import { z } from "zod"

export const productFormSchema = z.object({
	providerId: z.string().min(1, "providerId requerido"),
	name: z
		.string()
		.min(10, "El título debe tener al menos 10 caracteres")
		.max(50, "El título no debe superar los 50 caracteres."),
	productType: z.enum(["Hotel", "Tour", "Package"], {
		required_error: "Tipo de producto requerido",
	}),
	description: z
		.string()
		.min(10, "La descripcion debe tener al menos 10 caracteres")
		.max(500, "La descripcion no debe superar los 500 caracteres")
		.optional()
		.or(z.literal("")),
	destinationId: z.string().min(1, "Selecciona una ciudad o localidad"),
	// imágenes: validamos en cliente con la metadata y en server por seguridad
	imagesMeta: z
		.array(
			z.object({
				name: z.string(),
				size: z
					.number()
					.max(10 * 1024 * 1024, "El tamaño de cada imagen no debe ser superior a los 10 KB."), // ajusta a tu límite real
				type: z.string().regex(/^image\//, "Debe ser imagen"),
			})
		)
		.min(1, "Debe subir al menos una imagen."),
})

export type ProductForm = z.infer<typeof productFormSchema>
