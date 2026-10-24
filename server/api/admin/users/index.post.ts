import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireAdmin, safeUser } from '../../../utils/auth'

const schema = z.object({
  account: z.string().trim().regex(/^[a-zA-Z0-9_.-]{3,40}$/, '账户为 3-40 位字母、数字或 _ . -'),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(6).max(100),
  role: z.enum(['ADMIN', 'USER']).default('USER')
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readValidatedBody(event, schema.parse)
  const { password, ...fields } = body
  try {
    const user = await prisma.user.create({ data: { ...fields, passwordHash: await bcrypt.hash(password, 12) } })
    return safeUser(user)
  } catch (error: any) {
    if (error.code === 'P2002') throw createError({ statusCode: 409, statusMessage: '该账户已存在' })
    throw error
  }
})
