import type { Album, Photo } from '~/types'

interface PhotoResponse { items: Photo[]; total: number; page: number; pageSize: number }

export const useLibraryStore = defineStore('library', {
  state: () => ({
    albums: [] as Album[],
    total: 0,
    unclassified: 0,
    photos: [] as Photo[],
    totalPhotos: 0,
    page: 1,
    pageSize: 48,
    loading: false,
    search: '',
    selectedIds: [] as string[],
    activeAlbumId: 'all'
  }),
  actions: {
    async fetchAlbums() {
      const response = await $fetch<{ albums: Album[]; total: number; unclassified: number }>('/api/albums')
      this.albums = response.albums
      this.total = response.total
      this.unclassified = response.unclassified
    },
    async fetchPhotos() {
      this.loading = true
      try {
        const response = await $fetch<PhotoResponse>('/api/photos', {
          query: { albumId: this.activeAlbumId, page: this.page, pageSize: this.pageSize, q: this.search }
        })
        this.photos = response.items
        this.totalPhotos = response.total
        this.selectedIds = this.selectedIds.filter((id) => this.photos.some((photo) => photo.id === id))
      } finally {
        this.loading = false
      }
    },
    async refresh() {
      await Promise.all([this.fetchAlbums(), this.fetchPhotos()])
    },
    async setAlbum(id: string) {
      this.activeAlbumId = id
      this.page = 1
      this.selectedIds = []
      await this.fetchPhotos()
    },
    toggleSelected(id: string) {
      this.selectedIds = this.selectedIds.includes(id)
        ? this.selectedIds.filter((item) => item !== id)
        : [...this.selectedIds, id]
    },
    async uploadFiles(files: File[], albumId: string | null) {
      const form = new FormData()
      files.forEach((file) => form.append('files', file))
      if (albumId) form.append('albumId', albumId)
      const response = await $fetch<{ items: Photo[]; errors: { name: string; message: string }[] }>('/api/photos/upload', { method: 'POST', body: form })
      await this.refresh()
      return response
    },
    async movePhoto(id: string, albumId: string | null) {
      await $fetch(`/api/photos/${id}/move`, { method: 'POST', body: { albumId: albumId || null } })
    },
    async deletePhoto(id: string) {
      await $fetch(`/api/photos/${id}`, { method: 'DELETE' })
    }
  }
})
