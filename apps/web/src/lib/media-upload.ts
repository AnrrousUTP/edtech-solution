export const MAX_MEDIA_UPLOAD_BYTES = 4_900_000
export const MAX_MEDIA_UPLOAD_LABEL = '4.9 MB'
export const MAX_MEDIA_UPLOAD_ERROR = `El archivo debe pesar hasta ${MAX_MEDIA_UPLOAD_LABEL}`

export const mediaUploadSizeIsAllowed = (sizeBytes: number): boolean =>
  Number.isInteger(sizeBytes) && sizeBytes >= 1 && sizeBytes <= MAX_MEDIA_UPLOAD_BYTES
