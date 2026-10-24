import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, photoDto } from '../../../utils/photo'

const schema = z.object({ albumId: z.string().nullable() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { albumId } = await readValidatedBody(event, schema.parse)
  const photo = await getOwnedPhoto(id, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  if (albumId) {
    const album = await prisma.album.findFirst({ where: { id: albumId, ownerId: user.id } })
    if (!album) throw createError({ statusCode: 400, statusMessage: '目标相册不存在' })
  }
  await prisma.photo.update({ where: { id }, data: { albumId } })
  return photoDto(await getOwnedPhoto(id, user.id))
})
