import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { requireAuth } from '../../../utils/auth'
import { addPhotoVersion, getOwnedPhoto, photoDto } from '../../../utils/photo'
import { localPath } from '../../../utils/storage'
import { requestAiEnhancement } from '../../../services/ai'

const schema = z.object({ mode: z.enum(['enhance', 'upscale2x', 'upscale4x', 'face']).default('enhance') })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  const { mode } = await readValidatedBody(event, schema.parse)
  const current = photo.versions.find((version) => version.versionNo === photo.currentVersionNo)
  if (!current) throw createError({ statusCode: 404, statusMessage: '当前图片版本不存在' })
  const input = await readFile(localPath(current.storedPath))
  const output = await requestAiEnhancement(event, user.id, input, photo.originalName, mode)
  if (output.length > 30 * 1024 * 1024) throw createError({ statusCode: 502, statusMessage: 'AI 返回的图片过大' })
  const updated = await addPhotoVersion(photo, output, 'AI', JSON.stringify({ mode, provider: 'configured-api' }))
  return photoDto(updated)
})
