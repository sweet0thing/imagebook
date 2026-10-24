<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Album } from '~/types'

const auth = useAuthStore()
const library = useLibraryStore()
const route = useRoute()
const uploadOpen = ref(false)
const sidebarOpen = ref(false)
const albumDialog = ref(false)
const editingAlbum = ref<Album | null>(null)
const albumForm = reactive({ name: '', description: '' })
let searchTimer: ReturnType<typeof setTimeout> | undefined

const isLibrary = computed(() => route.path === '/' || route.path.startsWith('/albums/'))

onMounted(async () => {
  await library.fetchAlbums()
  window.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
watch(() => route.fullPath, () => { sidebarOpen.value = false })

function onPaste(event: ClipboardEvent) {
  const target = event.target as HTMLElement
  if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
  if (files.length) {
    uploadOpen.value = true
    nextTick(() => window.dispatchEvent(new CustomEvent('imagebook-paste', { detail: files })))
  }
}

function searchPhotos() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    library.page = 1
    library.fetchPhotos()
  }, 300)
}

function openAlbum(album?: Album) {
  editingAlbum.value = album || null
  albumForm.name = album?.name || ''
  albumForm.description = album?.description || ''
  albumDialog.value = true
}

async function saveAlbum() {
  if (!albumForm.name.trim()) return ElMessage.warning('请输入相册名称')
  try {
    if (editingAlbum.value) {
      await $fetch(`/api/albums/${editingAlbum.value.id}`, { method: 'PATCH', body: albumForm })
    } else {
      await $fetch('/api/albums', { method: 'POST', body: albumForm })
    }
    albumDialog.value = false
    await library.fetchAlbums()
    ElMessage.success(editingAlbum.value ? '相册已更新' : '相册已创建')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '保存相册失败')
  }
}

async function removeAlbum(album: Album) {
  await ElMessageBox.confirm(`删除“${album.name}”后，其中图片会移到未分类，不会删除图片。`, '删除相册', { type: 'warning' })
  await $fetch(`/api/albums/${album.id}`, { method: 'DELETE' })
  await library.fetchAlbums()
  if (route.params.id === album.id) await navigateTo('/')
}

async function dropOnAlbum(event: DragEvent, albumId: string | null) {
  const id = event.dataTransfer?.getData('application/x-imagebook-photo')
  if (!id) return
  await library.movePhoto(id, albumId)
  await library.refresh()
  ElMessage.success('图片已移动')
}

async function userCommand(command: string) {
  if (command === 'settings') await navigateTo('/settings')
  if (command === 'logout') await auth.logout()
}
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="sidebar-mask" @click="sidebarOpen = false" />
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <NuxtLink to="/" class="brand"><AppIcon name="logo" :size="31" /><span>ImageBook</span></NuxtLink>
      <nav class="primary-nav">
        <NuxtLink to="/" class="nav-item" :class="{ active: route.path === '/' && route.query.album !== 'uncategorized' }">
          <AppIcon name="images" /><span>全部图片</span><small>{{ library.total }}</small>
        </NuxtLink>
        <NuxtLink to="/?album=uncategorized" class="nav-item" :class="{ active: route.query.album === 'uncategorized' }">
          <AppIcon name="folder" /><span>未分类</span><small>{{ library.unclassified }}</small>
        </NuxtLink>
      </nav>
      <div class="sidebar-section-title"><span>我的相册</span><button class="icon-button" title="新建相册" @click="openAlbum()"><AppIcon name="plus" :size="17" /></button></div>
      <div class="album-nav">
        <div v-for="album in library.albums" :key="album.id" class="album-nav-row" :class="{ active: route.params.id === album.id }" @dragover.prevent @drop.prevent="dropOnAlbum($event, album.id)">
          <NuxtLink :to="`/albums/${album.id}`" class="nav-item"><AppIcon name="folder" /><span>{{ album.name }}</span><small>{{ album._count?.photos || 0 }}</small></NuxtLink>
          <el-dropdown trigger="click">
            <button class="icon-button album-more"><AppIcon name="more" :size="17" /></button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item @click="openAlbum(album)">编辑相册</el-dropdown-item><el-dropdown-item divided @click="removeAlbum(album)">删除相册</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
        <button v-if="!library.albums.length" class="empty-albums" @click="openAlbum()">新建第一个相册</button>
      </div>
      <div class="sidebar-bottom">
        <NuxtLink v-if="auth.user?.role === 'ADMIN'" to="/admin/users" class="nav-item" :class="{ active: route.path.startsWith('/admin') }"><AppIcon name="users" /><span>用户管理</span></NuxtLink>
        <NuxtLink to="/settings" class="nav-item" :class="{ active: route.path === '/settings' }"><AppIcon name="settings" /><span>设置</span></NuxtLink>
      </div>
    </aside>

    <section class="main-shell">
      <header class="topbar">
        <button class="icon-button mobile-menu" @click="sidebarOpen = true"><AppIcon name="menu" /></button>
        <div v-if="isLibrary" class="global-search"><AppIcon name="search" :size="18" /><input v-model="library.search" placeholder="搜索标题、备注或文件名" @input="searchPhotos"></div>
        <div v-else class="topbar-spacer" />
        <button class="primary-button upload-button" @click="uploadOpen = true"><AppIcon name="upload" :size="18" />上传图片</button>
        <el-dropdown trigger="click" @command="userCommand">
          <button class="profile-trigger">
            <img v-if="auth.user?.avatarUrl" :src="auth.user.avatarUrl" alt="头像">
            <AppIcon v-else name="user" :size="18" />
            <span>{{ auth.user?.displayName }}</span><AppIcon name="chevron-down" :size="14" />
          </button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="settings">个人设置</el-dropdown-item><el-dropdown-item command="logout" divided>退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </header>
      <main class="page-content"><slot /></main>
    </section>

    <UploadDialog v-model="uploadOpen" />
    <el-dialog v-model="albumDialog" :title="editingAlbum ? '编辑相册' : '新建相册'" width="460px">
      <div class="form-row"><label>相册名称</label><el-input v-model="albumForm.name" maxlength="60" placeholder="例如：2026 年的旅行" /></div>
      <div class="form-row"><label>描述</label><el-input v-model="albumForm.description" type="textarea" :rows="3" maxlength="500" placeholder="这个相册里收藏了什么？" /></div>
      <template #footer><el-button @click="albumDialog = false">取消</el-button><el-button type="primary" @click="saveAlbum">保存</el-button></template>
    </el-dialog>
  </div>
</template>
