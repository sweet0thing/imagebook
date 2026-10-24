import { requireAuth } from '../../../utils/auth'
import { addPhotoVersion, getOwnedPhoto, photoDto } from '../../../utils/photo'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const photo = await getOwnedPhoto(getRouterParam(event, 'id')!, user.id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  if (!file?.data?.length) throw createError({ statusCode: 400, statusMessage: '缺少编辑后的图片' })
  if (file.data.length > 30 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: '编辑结果不能超过 30 MB' })
  const editorState = parts?.find((part) => part.name === 'editorState')?.data.toString()
  const updated = await addPhotoVersion(photo, file.data, 'EDIT', editorState)
  return photoDto(updated)
})
