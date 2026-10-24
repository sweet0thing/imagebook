import { readFile } from 'node:fs/promises'
import { requireAuth } from '../../utils/auth'
import { localPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!user.avatarPath) throw createError({ statusCode: 404, statusMessage: '尚未设置头像' })
  setHeader(event, 'Content-Type', 'image/webp')
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return readFile(localPath(user.avatarPath))
})
