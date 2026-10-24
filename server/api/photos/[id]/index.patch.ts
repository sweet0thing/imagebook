import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, photoDto } from '../../../utils/photo'

const schema = z.object({
  title: z.string().max(200).nullable().optional(),
  note: z.string().max(20000).nullable().optional(),
  albumId: z.string().nullable().optional(),
  currentVersionNo: z.number().int().min(1).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, schema.parse)
  const photo = await getOwnedPhoto(id, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  if (body.albumId) {
    const album = await prisma.album.findFirst({ where: { id: body.albumId, ownerId: user.id } })
    if (!album) throw createError({ statusCode: 400, statusMessage: '目标相册不存在' })
  }
  if (body.currentVersionNo && !photo.versions.some((version) => version.versionNo === body.currentVersionNo)) {
    throw createError({ statusCode: 400, statusMessage: '图片版本不存在' })
  }
  await prisma.photo.update({ where: { id }, data: body })
  return photoDto(await getOwnedPhoto(id, user.id))
})
