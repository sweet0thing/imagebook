import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { createSession, safeUser } from '../../utils/auth'

const schema = z.object({ account: z.string().min(1), password: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, schema.parse)
  const user = await prisma.user.findUnique({ where: { account: body.account.trim() } })
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw createError({ statusCode: 401, statusMessage: '账户或密码错误' })
  }
  createSession(event, user.id)
  return { user: safeUser(user) }
})
