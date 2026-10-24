import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6, '新密码至少 6 位').max(100) })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, schema.parse)
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw createError({ statusCode: 400, statusMessage: '当前密码不正确' })
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } })
  return { ok: true }
})
