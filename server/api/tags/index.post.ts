import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

const schema = z.object({ name: z.string().trim().min(1).max(30), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, schema.parse)
  try {
    return await prisma.tag.create({ data: { ...body, ownerId: user.id } })
  } catch (error: any) {
    if (error.code === 'P2002') throw createError({ statusCode: 409, statusMessage: '同名标签已存在' })
    throw error
  }
})
