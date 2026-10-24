import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  coverPhotoId: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, schema.parse)
  const album = await prisma.album.findFirst({ where: { id, ownerId: user.id } })
  if (!album) throw createError({ statusCode: 404, statusMessage: '相册不存在' })
  if (body.coverPhotoId) {
    const photo = await prisma.photo.findFirst({ where: { id: body.coverPhotoId, ownerId: user.id, albumId: id } })
    if (!photo) throw createError({ statusCode: 400, statusMessage: '封面图片必须属于该相册' })
  }
  return prisma.album.update({ where: { id }, data: body })
})
