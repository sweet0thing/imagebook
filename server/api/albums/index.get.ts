import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const [albums, total, unclassified] = await Promise.all([
    prisma.album.findMany({
      where: { ownerId: user.id },
      include: { _count: { select: { photos: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.photo.count({ where: { ownerId: user.id } }),
    prisma.photo.count({ where: { ownerId: user.id, albumId: null } })
  ])
  return { albums, total, unclassified }
})
