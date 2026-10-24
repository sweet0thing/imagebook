import { mkdir, unlink } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export const storageRoot = resolve(process.cwd(), process.env.STORAGE_DIR || './storage')

export async function ensureStorage() {
  await Promise.all(
    ['originals', 'versions', 'thumbnails', 'avatars'].map((directory) =>
      mkdir(resolve(storageRoot, directory), { recursive: true })
    )
  )
}

export function localPath(relativePath: string) {
  const path = resolve(storageRoot, relativePath)
  if (!path.startsWith(`${storageRoot}${sep}`)) {
    throw createError({ statusCode: 400, statusMessage: '无效的文件路径' })
  }
  return path
}

export async function removeLocalFile(relativePath?: string | null) {
  if (!relativePath) return
  try {
    await unlink(localPath(relativePath))
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.error('Failed to remove local file', error)
  }
}
