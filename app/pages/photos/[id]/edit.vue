<script setup lang="ts">
import type { Photo } from '~/types'

const route = useRoute()
const library = useLibraryStore()
const photo = ref<Photo | null>(null)

onMounted(async () => {
  const [response] = await Promise.all([
    $fetch<Photo>(`/api/photos/${route.params.id}`),
    library.fetchAlbums()
  ])
  photo.value = response
})

function onSaved(updated: Photo) {
  photo.value = updated
  library.refresh()
}
async function onSavedAs(created: Photo) {
  await library.refresh()
  await navigateTo(`/photos/${created.id}`)
}
</script>

<template>
  <PhotoEditor v-if="photo" :key="photo.id" :photo="photo" @saved="onSaved" @saved-as="onSavedAs" />
  <div v-else class="empty-state"><span>正在载入图片…</span></div>
</template>
