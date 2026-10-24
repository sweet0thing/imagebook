import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'
import { photoDto, photoInclude } from '../../utils/photo'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 48))
  const albumId = String(query.albumId || '')
  const search = String(query.q || '').trim()
  const tag = String(query.tag || '').trim()
  const where: any = { ownerId: user.id }
  if (albumId === 'uncategorized') where.albumId = null
  else if (albumId && albumId !== 'all') where.albumId = albumId
  if (search) {
    where.OR = ['title', 'note', 'originalName'].map((field) => ({ [field]: { contains: search } }))
  }
  if (tag) where.tags = { some: { OR: [{ tagId: tag }, { tag: { name: tag } }] } }
  const [photos, total] = await Promise.all([
    prisma.photo.findMany({ where, include: photoInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.photo.count({ where })
  ])
  return { items: photos.map(photoDto), total, page, pageSize }
})
