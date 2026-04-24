export type LoadedImage = {
  bitmap: ImageBitmap
  width: number
  height: number
  mime: string
  name: string
  sizeBytes: number
}

export async function loadImageFromBlob(blob: Blob, name = 'image'): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    mime: blob.type || 'image/*',
    name,
    sizeBytes: blob.size,
  }
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  return loadImageFromBlob(file, file.name)
}
