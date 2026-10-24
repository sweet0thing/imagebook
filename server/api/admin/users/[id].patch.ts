import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireAdmin, safeUser } from '../../../utils/auth'

const schema = z.object({
  role: z.enum(['ADMIN', 'USER']).optional(),
  password: z.string().min(6).max(100).optional()
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, schema.parse)
  if (id === admin.id && body.role === 'USER') throw createError({ statusCode: 400, statusMessage: '不能降低自己的管理员权限' })
  const data: any = {}
  if (body.role) data.role = body.role
  if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12)
  const user = await prisma.user.update({ where: { id }, data })
  return safeUser(user)
})
