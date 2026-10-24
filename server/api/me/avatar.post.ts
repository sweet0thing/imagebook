import sharp from 'sharp'
import { prisma } from '../../utils/prisma'
import { requireAuth, safeUser } from '../../utils/auth'
import { localPath, removeLocalFile } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  if (!file?.data?.length) throw createError({ statusCode: 400, statusMessage: '请选择头像图片' })
  if (file.data.length > 5 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: '头像不能超过 5 MB' })
  let avatar: Buffer
  try {
    avatar = await sharp(file.data, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 88 })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: '头像文件不是有效图片' })
  }
  const avatarPath = `avatars/${user.id}.webp`
  await import('node:fs/promises').then(({ writeFile }) => writeFile(localPath(avatarPath), avatar))
  await removeLocalFile(user.avatarPath === avatarPath ? null : user.avatarPath)
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatarPath } })
  return { user: safeUser(updated) }
})
