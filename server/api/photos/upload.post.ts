import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'
import { createPhoto, photoDto } from '../../utils/photo'

const allowedExtensions = /\.(jpe?g|png|webp)$/i
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: '请选择要上传的图片' })
  const albumId = parts.find((part) => part.name === 'albumId')?.data.toString() || null
  if (albumId) {
    const album = await prisma.album.findFirst({ where: { id: albumId, ownerId: user.id } })
    if (!album) throw createError({ statusCode: 400, statusMessage: '目标相册不存在' })
  }
  const files = parts.filter((part) => part.name === 'files' && part.filename)
  if (!files.length) throw createError({ statusCode: 400, statusMessage: '请选择要上传的图片' })
  if (files.length > 30) throw createError({ statusCode: 400, statusMessage: '单次最多上传 30 张图片' })
  const items = []
  const errors = []
  for (const file of files) {
    const name = file.filename || 'image'
    try {
      if (!allowedExtensions.test(name) || !allowedMimeTypes.has(file.type || '')) {
        throw new Error('仅支持 JPG、JPEG、PNG 和 WebP')
      }
      if (file.data.length > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB')
      if (!file.data.length) throw new Error('文件为空')
      const photo = await createPhoto({ ownerId: user.id, albumId, originalName: name, buffer: file.data })
      items.push(photoDto(photo))
    } catch (error: any) {
      errors.push({ name, message: error.statusMessage || error.message || '上传失败' })
    }
  }
  return { items, errors }
})
