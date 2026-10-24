import { requireAuth } from '../../../utils/auth'
import { getOwnedPhoto, photoDto } from '../../../utils/photo'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  return photoDto(photo)
})
