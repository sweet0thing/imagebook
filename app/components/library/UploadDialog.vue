<script setup lang="ts">
import { ElMessage } from 'element-plus'

const visible = defineModel<boolean>({ required: true })
const library = useLibraryStore()
const files = ref<File[]>([])
const albumId = ref<string | null>(null)
const uploading = ref(false)
const input = ref<HTMLInputElement>()
const onPaste = (event: Event) => addFiles((event as CustomEvent<File[]>).detail || [])

onMounted(() => window.addEventListener('imagebook-paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('imagebook-paste', onPaste))

watch(visible, (open) => {
  if (open) {
    files.value = []
    albumId.value = ['all', 'uncategorized'].includes(library.activeAlbumId) ? null : library.activeAlbumId
  }
})

function addFiles(incoming: File[]) {
  const accepted = incoming.filter((file) => {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      ElMessage.warning(`${file.name}：仅支持 JPG、PNG、WebP`)
      return false
    }
    if (file.size > 20 * 1024 * 1024) {
      ElMessage.warning(`${file.name}：不能超过 20 MB`)
      return false
    }
    return true
  })
  const existing = new Set(files.value.map((file) => `${file.name}:${file.size}`))
  files.value.push(...accepted.filter((file) => !existing.has(`${file.name}:${file.size}`)))
}

async function upload() {
  if (!files.value.length) return
  uploading.value = true
  try {
    const result = await library.uploadFiles(files.value, albumId.value)
    if (result.items.length) ElMessage.success(`已保存 ${result.items.length} 张图片到本站`)
    result.errors.forEach((error) => ElMessage.error(`${error.name}：${error.message}`))
    if (!result.errors.length) visible.value = false
    else files.value = files.value.filter((file) => result.errors.some((error) => error.name === file.name))
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '上传失败')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="上传本地图片" width="560px" :close-on-click-modal="false">
    <input ref="input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple hidden @change="addFiles(Array.from(($event.target as HTMLInputElement).files || [])); ($event.target as HTMLInputElement).value = ''">
    <div class="upload-dropzone" @click="input?.click()" @dragover.prevent @drop.prevent="addFiles(Array.from($event.dataTransfer?.files || []))">
      <AppIcon name="upload" :size="36" />
      <strong>选择、拖拽或粘贴图片</strong>
      <span>JPG / JPEG / PNG / WebP，单张不超过 20 MB</span>
    </div>
    <div v-if="files.length" class="upload-file-list">
      <div v-for="(file, index) in files" :key="`${file.name}-${file.size}`" class="upload-file">
        <AppIcon name="images" :size="18" />
        <span>{{ file.name }}</span>
        <small>{{ (file.size / 1024 / 1024).toFixed(2) }} MB</small>
        <button class="icon-button" @click="files.splice(index, 1)"><AppIcon name="close" :size="16" /></button>
      </div>
    </div>
    <div class="form-row upload-album-row">
      <label>保存到相册</label>
      <el-select v-model="albumId" placeholder="未分类" clearable style="width: 100%">
        <el-option label="未分类" value="" />
        <el-option v-for="album in library.albums" :key="album.id" :label="album.name" :value="album.id" />
      </el-select>
    </div>
    <p class="storage-note"><AppIcon name="check" :size="15" /> 文件将直接保存在本网站服务器，不会从远端导入。</p>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!files.length" :loading="uploading" @click="upload">上传 {{ files.length || '' }} 张图片</el-button>
    </template>
  </el-dialog>
</template>
