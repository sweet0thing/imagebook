import { prisma } from '../../../utils/prisma'
import { requireAdmin, safeUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { photos: true, albums: true } } } })
  return users.map((user) => ({ ...safeUser(user), createdAt: user.createdAt, photoCount: user._count.photos, albumCount: user._count.albums }))
})
