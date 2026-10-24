import { prisma } from '../../../utils/prisma'
import { requireAuth } from '../../../utils/auth'
import { createPhoto, getOwnedPhoto, photoDto } from '../../../utils/photo'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const source = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!source) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  if (!file?.data?.length) throw createError({ statusCode: 400, statusMessage: '缺少另存为图片' })
  if (file.data.length > 30 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: '图片不能超过 30 MB' })
  const field = (name: string) => parts?.find((part) => part.name === name)?.data.toString() || ''
  const albumId = field('albumId') || source.albumId
  if (albumId) {
    const album = await prisma.album.findFirst({ where: { id: albumId, ownerId: user.id } })
    if (!album) throw createError({ statusCode: 400, statusMessage: '目标相册不存在' })
  }
  const created = await createPhoto({
    ownerId: user.id,
    albumId,
    sourcePhotoId: source.id,
    originalName: file.filename || field('title') || source.originalName,
    title: field('title') || `${source.title || source.originalName} 副本`,
    note: source.note,
    buffer: file.data,
    kind: 'SAVE_AS',
    editorState: field('editorState') || null
  })
  return photoDto(created)
})
