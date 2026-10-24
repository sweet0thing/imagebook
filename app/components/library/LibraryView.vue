<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const library = useLibraryStore()
const route = useRoute()
const moveOpen = ref(false)
const uploadOpen = ref(false)
const targetAlbum = ref<string | null>(null)
const moving = ref(false)

const albumKey = computed(() => String(route.params.id || route.query.album || 'all'))
const title = computed(() => {
  if (albumKey.value === 'uncategorized') return '未分类'
  if (albumKey.value === 'all') return library.search ? '搜索结果' : '全部图片'
  return library.albums.find((album) => album.id === albumKey.value)?.name || '相册'
})
const subtitle = computed(() => `${library.totalPhotos} 张图片 · 图片文件保存在本站`)

watch(albumKey, async () => {
  await library.setAlbum(albumKey.value)
}, { immediate: true })

function dragStart(event: DragEvent, id: string) {
  event.dataTransfer?.setData('application/x-imagebook-photo', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

async function moveSelected() {
  moving.value = true
  try {
    await Promise.all(library.selectedIds.map((id) => library.movePhoto(id, targetAlbum.value)))
    ElMessage.success(`已移动 ${library.selectedIds.length} 张图片`)
    library.selectedIds = []
    moveOpen.value = false
    await library.refresh()
  } finally {
    moving.value = false
  }
}

async function deleteSelected() {
  const count = library.selectedIds.length
  await ElMessageBox.confirm(`确定删除选中的 ${count} 张图片吗？原图及所有版本都会被删除。`, '删除图片', { type: 'warning', confirmButtonText: '删除' })
  await Promise.all(library.selectedIds.map((id) => library.deletePhoto(id)))
  library.selectedIds = []
  await library.refresh()
  ElMessage.success('图片已删除')
}

async function changePage(page: number) {
  library.page = page
  await library.fetchPhotos()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <section>
    <div class="page-heading">
      <div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div>
      <div class="page-actions">
        <el-select v-if="library.selectedIds.length" v-model="targetAlbum" placeholder="移动到相册" clearable style="width: 160px" @change="moveOpen = true">
          <el-option label="未分类" value="" />
          <el-option v-for="album in library.albums" :key="album.id" :label="album.name" :value="album.id" />
        </el-select>
        <button class="secondary-button" @click="library.refresh()"><AppIcon name="rotate-right" :size="16" />刷新</button>
      </div>
    </div>

    <div v-if="library.selectedIds.length" class="library-toolbar">
      <span class="selection-count">已选择 {{ library.selectedIds.length }} 张</span>
      <button class="secondary-button" @click="targetAlbum = library.activeAlbumId === 'all' ? null : library.activeAlbumId; moveOpen = true"><AppIcon name="move" :size="16" />移动</button>
      <button class="danger-button" @click="deleteSelected"><AppIcon name="trash" :size="16" />删除</button>
      <button class="icon-button" title="取消选择" @click="library.selectedIds = []"><AppIcon name="close" :size="16" /></button>
    </div>

    <div v-loading="library.loading" class="photo-grid">
      <article v-for="photo in library.photos" :key="photo.id" class="photo-card" :class="{ selected: library.selectedIds.includes(photo.id) }" draggable="true" @dragstart="dragStart($event, photo.id)">
        <button class="photo-select" @click.stop="library.toggleSelected(photo.id)"><AppIcon v-if="library.selectedIds.includes(photo.id)" name="check" :size="16" /></button>
        <img class="photo-thumb" :src="photo.thumbnailUrl" :alt="photo.title" loading="lazy" @click="navigateTo(`/photos/${photo.id}`)">
        <div class="photo-card-body">
          <NuxtLink :to="`/photos/${photo.id}`" class="photo-card-title">{{ photo.title || photo.originalName }}</NuxtLink>
          <div class="photo-card-meta">
            <span>{{ photo.currentVersion.width }} × {{ photo.currentVersion.height }}</span>
            <AppIcon v-if="photo.note" name="note" :size="13" class="photo-note-dot" />
            <AppIcon v-if="photo.tags.length" name="tag" :size="13" />
            <span v-if="photo.versions.length > 1">· {{ photo.versions.length }} 个版本</span>
          </div>
        </div>
      </article>
    </div>

    <div v-if="!library.loading && !library.photos.length" class="empty-state">
      <div class="empty-icon"><AppIcon name="images" :size="38" /></div>
      <h3>{{ library.search ? '没有找到匹配的图片' : '这里还没有图片' }}</h3>
      <p>{{ library.search ? '试试其他标题、备注或文件名。' : '从电脑选择图片上传，原图会保存在本网站。' }}</p>
      <button v-if="!library.search" class="primary-button" @click="uploadOpen = true"><AppIcon name="upload" :size="17" />上传第一张图片</button>
    </div>

    <div v-if="library.totalPhotos > library.pageSize" class="pagination-row">
      <el-pagination background layout="prev, pager, next" :total="library.totalPhotos" :page-size="library.pageSize" :current-page="library.page" @current-change="changePage" />
    </div>

    <el-dialog v-model="moveOpen" title="移动图片" width="430px">
      <p class="muted">将 {{ library.selectedIds.length }} 张图片移动到：</p>
      <el-select v-model="targetAlbum" placeholder="选择相册" clearable style="width: 100%; margin-top: 14px">
        <el-option label="未分类" value="" />
        <el-option v-for="album in library.albums" :key="album.id" :label="album.name" :value="album.id" />
      </el-select>
      <template #footer><el-button @click="moveOpen = false">取消</el-button><el-button type="primary" :loading="moving" @click="moveSelected">移动</el-button></template>
    </el-dialog>
    <UploadDialog v-model="uploadOpen" />
  </section>
</template>
