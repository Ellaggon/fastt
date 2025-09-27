import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"

export const r2 = new S3Client({
	region: "auto",
	endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
	},
})

export const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL ?? ""
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? ""

export async function deleteObjectFromR2(bucket: string, key: string) {
	try {
		const command = new DeleteObjectCommand({ Bucket: bucket, Key: key })
		await r2.send(command)
		console.log(`Archivo eliminado: ${key}`)
	} catch (e) {
		console.error("Error eliminando el objeto de R2: ", e)
		throw new Error("No se pudo eliminar el objeto de Cloudflare R2")
	}
}
