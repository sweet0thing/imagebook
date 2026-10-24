<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Photo, PhotoVersion, Tag } from '~/types'

const route = useRoute()
const library = useLibraryStore()
const photo = ref<Photo | null>(null)
const loading = ref(true)
const saving = ref(false)
const allTags = ref<Tag[]>([])
const form = reactive({ title: '', note: '', albumId: null as string | null, tagIds: [] as string[] })
const previewVersion = ref<number | null>(null)
const aiOpen = ref(false)
const aiMode = ref('enhance')
const enhancing = ref(false)
const id = computed(() => String(route.params.id))

const previewUrl = computed(() => photo.value && previewVersion.value
  ? `/api/photos/${photo.value.id}/file?variant=current&version=${previewVersion.value}`
  : photo.value?.imageUrl)
const currentIndex = computed(() => library.photos.findIndex((item) => item.id === id.value))
const previous = computed(() => currentIndex.value > 0 ? library.photos[currentIndex.value - 1] : null)
const next = computed(() => currentIndex.value >= 0 ? library.photos[currentIndex.value + 1] || null : null)

watch(id, loadPhoto, { immediate: true })
onMounted(async () => {
  await Promise.all([library.fetchAlbums(), loadTags()])
})

async function loadPhoto() {
  loading.value = true
  previewVersion.value = null
  try {
    const response = await $fetch<Photo>(`/api/photos/${id.value}`)
    photo.value = response
    Object.assign(form, { title: response.title, note: response.note, albumId: response.albumId, tagIds: response.tags.map((tag) => tag.id) })
  } finally { loading.value = false }
}
async function loadTags() { allTags.value = await $fetch<Tag[]>('/api/tags') }
async function saveDetails() {
  saving.value = true
  try {
    const tagIds = []
    for (const value of form.tagIds) {
      const existing = allTags.value.find((tag) => tag.id === value || tag.name === value)
      if (existing) tagIds.push(existing.id)
      else {
        const created = await $fetch<Tag>('/api/tags', { method: 'POST', body: { name: value, color: '#9a6545' } })
        allTags.value.push(created)
        tagIds.push(created.id)
      }
    }
    await $fetch<Photo>(`/api/photos/${id.value}`, { method: 'PATCH', body: { title: form.title, note: form.note, albumId: form.albumId || null } })
    const response = await $fetch<Photo>(`/api/photos/${id.value}/tags`, { method: 'PUT', body: { tagIds } })
    photo.value = response
    form.tagIds = response.tags.map((tag) => tag.id)
    await library.refresh()
    ElMessage.success('图片信息已保存')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '保存失败')
  } finally { saving.value = false }
}
function versionImage(version: PhotoVersion) {
  return `/api/photos/${id.value}/file?variant=current&version=${version.versionNo}`
}
function versionName(version: PhotoVersion) {
  return { ORIGINAL: '原图', EDIT: '编辑', AI: 'AI 优化', SAVE_AS: '另存为' }[version.kind] || `版本 ${version.versionNo}`
}
async function enhance() {
  enhancing.value = true
  try {
    const response = await $fetch<Photo>(`/api/photos/${id.value}/enhance`, { method: 'POST', body: { mode: aiMode.value }, timeout: 130000 })
    photo.value = response
    previewVersion.value = response.currentVersionNo
    aiOpen.value = false
    await library.refresh()
    ElMessage.success('AI 结果已保存为本站的新版本')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || 'AI 优化失败，请先检查设置')
  } finally { enhancing.value = false }
}
async function setCover() {
  if (!photo.value?.albumId) return
  await $fetch(`/api/albums/${photo.value.albumId}`, { method: 'PATCH', body: { coverPhotoId: photo.value.id } })
  ElMessage.success('已设为相册封面')
}
async function removePhoto() {
  await ElMessageBox.confirm('确定删除这张图片及其全部版本吗？此操作无法恢复。', '删除图片', { type: 'warning', confirmButtonText: '删除' })
  await $fetch(`/api/photos/${id.value}`, { method: 'DELETE' })
  await library.refresh()
  await navigateTo(photo.value?.albumId ? `/albums/${photo.value.albumId}` : '/')
}
function formatBytes(size: number) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(size / 1024)} KB` }
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN') }
</script>

<template>
  <section v-loading="loading">
    <template v-if="photo">
      <div class="page-heading">
        <div><h1>{{ photo.title || photo.originalName }}</h1><p>{{ photo.originalName }} · 上传于 {{ formatDate(photo.createdAt) }}</p></div>
        <div class="page-actions"><button class="secondary-button" @click="navigateTo(`/photos/${photo.id}/edit`)"><AppIcon name="edit" :size="16" />进入编辑器</button></div>
      </div>
      <div class="detail-layout">
        <div>
          <div class="detail-preview">
            <img :src="previewUrl" :alt="photo.title">
            <div class="preview-nav"><button class="icon-button" :disabled="!previous" @click="previous && navigateTo(`/photos/${previous.id}`)"><AppIcon name="chevron-left" /></button><button class="icon-button" :disabled="!next" @click="next && navigateTo(`/photos/${next.id}`)"><AppIcon name="chevron-right" /></button></div>
          </div>
          <div class="version-strip">
            <button v-for="version in photo.versions" :key="version.id" class="version-item" :class="{ active: (previewVersion || photo.currentVersionNo) === version.versionNo }" @click="previewVersion = version.versionNo">
              <img :src="versionImage(version)" :alt="versionName(version)"><span>V{{ version.versionNo }} · {{ versionName(version) }}</span>
            </button>
          </div>
        </div>
        <aside class="detail-panel">
          <h2>图片与故事</h2>
          <div class="detail-actions">
            <button class="primary-button" @click="aiOpen = true"><AppIcon name="sparkles" :size="16" />AI 优化</button>
            <a class="secondary-button" :href="`${previewUrl}&download=1`"><AppIcon name="download" :size="16" />下载</a>
            <button class="secondary-button" @click="navigateTo(`/photos/${photo.id}/edit`)"><AppIcon name="edit" :size="16" />编辑</button>
          </div>
          <div class="form-row"><label>标题</label><el-input v-model="form.title" maxlength="200" placeholder="给这张图片一个名字" /></div>
          <div class="form-row"><label>感受或备注</label><el-input v-model="form.note" type="textarea" :rows="5" maxlength="20000" show-word-limit placeholder="记录拍摄背景、当下感受，或任何想留下的话…" /></div>
          <div class="form-row"><label>所属相册</label><el-select v-model="form.albumId" clearable placeholder="未分类" style="width: 100%"><el-option label="未分类" value="" /><el-option v-for="album in library.albums" :key="album.id" :label="album.name" :value="album.id" /></el-select></div>
          <div class="form-row"><label>关键词标签</label><el-select v-model="form.tagIds" multiple filterable allow-create default-first-option placeholder="输入后回车创建标签" style="width: 100%"><el-option v-for="tag in allTags" :key="tag.id" :label="tag.name" :value="tag.id" /></el-select></div>
          <button class="primary-button" :disabled="saving" @click="saveDetails"><AppIcon name="save" :size="16" />保存图片信息</button>
          <div class="meta-list">
            <div><span>尺寸</span>{{ photo.currentVersion.width }} × {{ photo.currentVersion.height }}</div>
            <div><span>文件大小</span>{{ formatBytes(photo.currentVersion.size) }}</div>
            <div><span>格式</span>{{ photo.currentVersion.mimeType.replace('image/', '').toUpperCase() }}</div>
            <div><span>版本</span>{{ photo.versions.length }} 个</div>
          </div>
          <div class="page-actions">
            <el-button v-if="photo.albumId" size="small" @click="setCover">设为相册封面</el-button>
            <el-button size="small" type="danger" plain @click="removePhoto">删除图片</el-button>
          </div>
        </aside>
      </div>
      <el-dialog v-model="aiOpen" title="AI 优化" width="480px" :close-on-click-modal="!enhancing">
        <div class="privacy-notice">这次操作会把当前版本发送给设置中的 AI 服务，返回结果保存为本站的新版本，原图不会被覆盖。</div>
        <div class="form-row"><label>增强模式</label><el-radio-group v-model="aiMode"><el-radio-button value="enhance">清晰化</el-radio-button><el-radio-button value="upscale2x">2 倍超分</el-radio-button><el-radio-button value="upscale4x">4 倍超分</el-radio-button><el-radio-button value="face">人脸修复</el-radio-button></el-radio-group></div>
        <p class="form-hint">尚未配置接口？请先到“设置 → AI 优化接口”填写 API 地址和 API 码。</p>
        <template #footer><el-button @click="navigateTo('/settings')">前往设置</el-button><el-button type="primary" :loading="enhancing" @click="enhance">开始优化</el-button></template>
      </el-dialog>
    </template>
  </section>
</template>
