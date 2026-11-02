import { describe, expect, it } from 'bun:test'
import { MAX_MEDIA_UPLOAD_BYTES, mediaUploadSizeIsAllowed } from './media-upload'

describe('mediaUploadSizeIsAllowed', () => {
  it('accepts a file exactly at the 4.9 MB limit', () => {
    expect(mediaUploadSizeIsAllowed(MAX_MEDIA_UPLOAD_BYTES)).toBe(true)
  })

  it('accepts a file below the limit', () => {
    expect(mediaUploadSizeIsAllowed(4_841_683)).toBe(true)
  })

  it('rejects a file above the limit and empty or fractional sizes', () => {
    expect(mediaUploadSizeIsAllowed(MAX_MEDIA_UPLOAD_BYTES + 1)).toBe(false)
    expect(mediaUploadSizeIsAllowed(0)).toBe(false)
    expect(mediaUploadSizeIsAllowed(1.5)).toBe(false)
  })
})
