import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return prisma.tag.findMany({ where: { ownerId: user.id }, orderBy: { name: 'asc' } })
})
