import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireAuth } from '../../utils/auth'

const schema = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(500).optional() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, schema.parse)
  try {
    return await prisma.album.create({ data: { ...body, ownerId: user.id } })
  } catch (error: any) {
    if (error.code === 'P2002') throw createError({ statusCode: 409, statusMessage: '同名相册已存在' })
    throw error
  }
})
