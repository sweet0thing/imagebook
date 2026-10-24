import { prisma } from '../../../utils/prisma'
import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, removePhotoFiles } from '../../../utils/photo'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  await prisma.photo.delete({ where: { id: photo.id } })
  await prisma.album.updateMany({ where: { coverPhotoId: photo.id }, data: { coverPhotoId: null } })
  await removePhotoFiles(photo)
  return { ok: true }
})
