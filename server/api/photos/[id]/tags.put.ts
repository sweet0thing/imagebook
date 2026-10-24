import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, photoDto } from '../../../utils/photo'

const schema = z.object({ tagIds: z.array(z.string()).max(50) })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  const { tagIds } = await readValidatedBody(event, schema.parse)
  const count = await prisma.tag.count({ where: { ownerId: user.id, id: { in: tagIds } } })
  if (count !== new Set(tagIds).size) throw createError({ statusCode: 400, statusMessage: '包含无效标签' })
  await prisma.$transaction([
    prisma.photoTag.deleteMany({ where: { photoId: photo.id } }),
    prisma.photoTag.createMany({ data: tagIds.map((tagId) => ({ photoId: photo.id, tagId })) })
  ])
  return photoDto(await getOwnedPhoto(photo.id, user.id))
})
