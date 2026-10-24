import { prisma } from '../../../utils/prisma'
import { requireAdmin } from '../../../utils/auth'
import { removeLocalFile } from '../../../utils/storage'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  if (id === admin.id) throw createError({ statusCode: 400, statusMessage: '不能删除当前登录账户' })
  const user = await prisma.user.findUnique({ where: { id }, include: { photos: { include: { versions: true } } } })
  if (!user) throw createError({ statusCode: 404, statusMessage: '用户不存在' })
  await prisma.user.delete({ where: { id } })
  await Promise.all([
    removeLocalFile(user.avatarPath),
    ...user.photos.flatMap((photo) => [
      ...photo.versions.map((version) => removeLocalFile(version.storedPath)),
      removeLocalFile(`thumbnails/${photo.id}.webp`)
    ])
  ])
  return { ok: true }
})
