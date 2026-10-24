import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { prisma } from './prisma'
import { ensureStorage, localPath, removeLocalFile } from './storage'

const MAX_PIXELS = 100_000_000
const formats: Record<string, { mime: string; extension: string }> = {
  jpeg: { mime: 'image/jpeg', extension: '.jpg' },
  png: { mime: 'image/png', extension: '.png' },
  webp: { mime: 'image/webp', extension: '.webp' }
}

export const photoInclude = {
  versions: { orderBy: { versionNo: 'desc' as const } },
  tags: { include: { tag: true } }
}

export async function inspectImage(buffer: Buffer) {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata()
  } catch {
    throw createError({ statusCode: 400, statusMessage: '文件不是有效的图片或图片已损坏' })
  }
  const format = metadata.format ? formats[metadata.format] : undefined
  if (!format || !metadata.width || !metadata.height) {
    throw createError({ statusCode: 400, statusMessage: '仅支持 JPG、JPEG、PNG 和 WebP 图片' })
  }
  const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation || 0)
  return {
    ...format,
    width: swapsDimensions ? metadata.height : metadata.width,
    height: swapsDimensions ? metadata.width : metadata.height
  }
}

export function thumbnailRelativePath(photoId: string) {
  return `thumbnails/${photoId}.webp`
}

async function writeThumbnail(buffer: Buffer, photoId: string) {
  const path = localPath(thumbnailRelativePath(photoId))
  await mkdir(dirname(path), { recursive: true })
  await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path)
}

export async function getOwnedPhoto(id: string, ownerId: string) {
  return prisma.photo.findFirst({ where: { id, ownerId }, include: photoInclude })
}

export function photoDto(photo: any) {
  const versions = [...photo.versions]
    .sort((a, b) => b.versionNo - a.versionNo)
    .map(({ editorState, ...version }) => version)
  const currentVersion = versions.find((version) => version.versionNo === photo.currentVersionNo) || versions[0]
  return {
    id: photo.id,
    albumId: photo.albumId,
    title: photo.title || '',
    note: photo.note || '',
    originalName: photo.originalName,
    currentVersionNo: photo.currentVersionNo,
    sourcePhotoId: photo.sourcePhotoId,
    createdAt: photo.createdAt,
    updatedAt: photo.updatedAt,
    currentVersion,
    versions,
    tags: photo.tags.map((item: any) => item.tag),
    thumbnailUrl: `/api/photos/${photo.id}/file?variant=thumbnail&v=${photo.currentVersionNo}`,
    imageUrl: `/api/photos/${photo.id}/file?variant=current&v=${photo.currentVersionNo}`
  }
}

interface CreatePhotoInput {
  ownerId: string
  albumId?: string | null
  originalName: string
  title?: string | null
  note?: string | null
  sourcePhotoId?: string | null
  buffer: Buffer
  kind?: string
  editorState?: string | null
}

export async function createPhoto(input: CreatePhotoInput) {
  await ensureStorage()
  const info = await inspectImage(input.buffer)
  const photoId = randomUUID()
  const storedPath = `originals/${photoId}${info.extension}`
  const thumbnailPath = thumbnailRelativePath(photoId)
  try {
    await writeFile(localPath(storedPath), input.buffer, { flag: 'wx' })
    await writeThumbnail(input.buffer, photoId)
    await prisma.photo.create({
      data: {
        id: photoId,
        ownerId: input.ownerId,
        albumId: input.albumId || null,
        originalName: input.originalName,
        title: input.title || input.originalName.replace(/\.[^.]+$/, ''),
        note: input.note || null,
        sourcePhotoId: input.sourcePhotoId || null,
        versions: {
          create: {
            versionNo: 1,
            kind: input.kind || 'ORIGINAL',
            storedPath,
            mimeType: info.mime,
            size: input.buffer.byteLength,
            width: info.width,
            height: info.height,
            editorState: input.editorState || null
          }
        }
      }
    })
  } catch (error) {
    await Promise.all([removeLocalFile(storedPath), removeLocalFile(thumbnailPath)])
    throw error
  }
  return getOwnedPhoto(photoId, input.ownerId)
}

export async function addPhotoVersion(photo: any, buffer: Buffer, kind: 'EDIT' | 'AI', editorState?: string | null) {
  const info = await inspectImage(buffer)
  const versionNo = photo.currentVersionNo + 1
  const storedPath = `versions/${photo.id}/${versionNo}${info.extension}`
  const thumbnailPath = thumbnailRelativePath(photo.id)
  try {
    await mkdir(dirname(localPath(storedPath)), { recursive: true })
    await writeFile(localPath(storedPath), buffer, { flag: 'wx' })
    await writeThumbnail(buffer, photo.id)
    await prisma.$transaction([
      prisma.photoVersion.create({
        data: {
          photoId: photo.id,
          versionNo,
          kind,
          storedPath,
          mimeType: info.mime,
          size: buffer.byteLength,
          width: info.width,
          height: info.height,
          editorState: editorState || null
        }
      }),
      prisma.photo.update({ where: { id: photo.id }, data: { currentVersionNo: versionNo } })
    ])
  } catch (error) {
    await removeLocalFile(storedPath)
    const current = photo.versions.find((version: any) => version.versionNo === photo.currentVersionNo)
    if (current) await writeThumbnail(await readFile(localPath(current.storedPath)), photo.id)
    throw error
  }
  return getOwnedPhoto(photo.id, photo.ownerId)
}

export async function removePhotoFiles(photo: any) {
  await Promise.all([
    ...photo.versions.map((version: any) => removeLocalFile(version.storedPath)),
    removeLocalFile(thumbnailRelativePath(photo.id))
  ])
}
