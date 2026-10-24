export interface User {
  id: string
  account: string
  displayName: string
  role: 'ADMIN' | 'USER'
  avatarUrl: string | null
}

export interface Album {
  id: string
  name: string
  description: string | null
  coverPhotoId: string | null
  _count?: { photos: number }
}

export interface Tag {
  id: string
  name: string
  color: string | null
}

export interface PhotoVersion {
  id: string
  versionNo: number
  kind: string
  mimeType: string
  size: number
  width: number
  height: number
  editorState?: string | null
  createdAt: string
}

export interface Photo {
  id: string
  albumId: string | null
  title: string
  note: string
  originalName: string
  currentVersionNo: number
  sourcePhotoId: string | null
  createdAt: string
  updatedAt: string
  currentVersion: PhotoVersion
  versions: PhotoVersion[]
  tags: Tag[]
  thumbnailUrl: string
  imageUrl: string
}
