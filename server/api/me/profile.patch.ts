import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireAuth, safeUser } from '../../utils/auth'

const schema = z.object({ displayName: z.string().trim().min(1, '用户名不能为空').max(40) })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, schema.parse)
  const updated = await prisma.user.update({ where: { id: user.id }, data: { displayName: body.displayName } })
  return { user: safeUser(updated) }
})
