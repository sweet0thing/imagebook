import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const album = await prisma.album.findFirst({ where: { id, ownerId: user.id } })
  if (!album) throw createError({ statusCode: 404, statusMessage: '相册不存在' })
  await prisma.$transaction([
    prisma.photo.updateMany({ where: { albumId: id, ownerId: user.id }, data: { albumId: null } }),
    prisma.album.delete({ where: { id } })
  ])
  return { ok: true }
})
