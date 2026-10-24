import { readFile } from 'node:fs/promises'
import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, thumbnailRelativePath } from '../../../utils/photo'
import { localPath } from '../../../utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  const query = getQuery(event)
  const variant = String(query.variant || 'current')
  let path: string
  let mimeType = 'image/webp'
  let fileName = photo.originalName
  if (variant === 'thumbnail') {
    path = thumbnailRelativePath(photo.id)
  } else {
    const versionNo = variant === 'original' ? 1 : Number(query.version) || photo.currentVersionNo
    const version = photo.versions.find((item) => item.versionNo === versionNo)
    if (!version) throw createError({ statusCode: 404, statusMessage: '图片版本不存在' })
    path = version.storedPath
    mimeType = version.mimeType
    fileName = `${photo.title || photo.originalName}${version.mimeType === 'image/png' ? '.png' : version.mimeType === 'image/webp' ? '.webp' : '.jpg'}`
  }
  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  if (query.download === '1') setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return readFile(localPath(path))
})
