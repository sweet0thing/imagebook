<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const auth = useAuthStore()
const displayName = ref(auth.user?.displayName || '')
const avatarInput = ref<HTMLInputElement>()
const savingProfile = ref(false)
const password = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const ai = reactive({ baseUrl: '', apiKey: '', model: '', timeout: 60, configured: false, maskedKey: '' })
const aiLoading = ref(false)
const testing = ref(false)
const sections = [
  { id: 'profile', label: '个人资料', icon: 'user', description: '管理你的头像、登录账户和显示用户名。' },
  { id: 'security', label: '账户安全', icon: 'key', description: '定期更新密码，保护你的图片和账户安全。' },
  { id: 'ai', label: 'AI 优化接口', icon: 'sparkles', description: '配置当前账户独立使用的 AI 图片优化服务。' }
] as const
const activeSection = ref<(typeof sections)[number]['id']>('profile')
const currentSection = computed(() => sections.find((section) => section.id === activeSection.value)!)

onMounted(loadAi)
async function loadAi() {
  const response = await $fetch<typeof ai>('/api/settings/ai')
  Object.assign(ai, response, { apiKey: '' })
}

async function saveProfile() {
  savingProfile.value = true
  try {
    const response = await $fetch<{ user: any }>('/api/me/profile', { method: 'PATCH', body: { displayName: displayName.value } })
    auth.user = response.user
    ElMessage.success('个人资料已保存')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '保存失败')
  } finally {
    savingProfile.value = false
  }
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  try {
    const response = await $fetch<{ user: any }>('/api/me/avatar', { method: 'POST', body: form })
    auth.user = response.user
    ElMessage.success('头像已更新')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '头像上传失败')
  }
}

async function changePassword() {
  if (password.newPassword !== password.confirm) return ElMessage.warning('两次输入的新密码不一致')
  try {
    await $fetch('/api/me/password', { method: 'POST', body: password })
    Object.assign(password, { currentPassword: '', newPassword: '', confirm: '' })
    ElMessage.success('密码已修改')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '密码修改失败')
  }
}

async function saveAi() {
  aiLoading.value = true
  try {
    const response = await $fetch<typeof ai>('/api/settings/ai', { method: 'PUT', body: ai })
    Object.assign(ai, response, { apiKey: '' })
    ElMessage.success('AI 配置已加密保存')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || 'AI 配置保存失败')
  } finally {
    aiLoading.value = false
  }
}

async function testAi() {
  testing.value = true
  try {
    await $fetch('/api/settings/ai/test', { method: 'POST' })
    ElMessage.success('AI 接口测试成功，已收到有效图片')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '连接测试失败')
  } finally {
    testing.value = false
  }
}

async function clearAi() {
  await ElMessageBox.confirm('确定清除当前账户保存的 AI 地址和 API 码吗？', '清除 AI 配置', { type: 'warning' })
  const response = await $fetch<typeof ai>('/api/settings/ai', { method: 'PUT', body: { clear: true } })
  Object.assign(ai, response, { apiKey: '' })
  ElMessage.success('AI 配置已清除')
}
</script>

<template>
  <section class="settings-page">
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <div class="settings-account">
          <div class="settings-account-avatar">
            <img v-if="auth.user?.avatarUrl" :src="auth.user.avatarUrl" alt="当前头像">
            <AppIcon v-else name="user" :size="24" />
          </div>
          <div><strong>{{ auth.user?.displayName }}</strong><span>{{ auth.user?.account }}</span></div>
        </div>
        <nav class="settings-nav" aria-label="设置分类">
          <button
            v-for="section in sections"
            :id="`settings-tab-${section.id}`"
            :key="section.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSection === section.id }"
            :aria-current="activeSection === section.id ? 'page' : undefined"
            aria-controls="settings-panel"
            @click="activeSection = section.id"
          >
            <AppIcon :name="section.icon" :size="18" />
            <span>{{ section.label }}</span>
            <AppIcon class="settings-nav-arrow" name="chevron-right" :size="15" />
          </button>
        </nav>
      </aside>

      <div class="settings-content">
        <header class="settings-content-heading">
          <h1>{{ currentSection.label }}</h1>
          <p>{{ currentSection.description }}</p>
        </header>

        <div
          v-if="activeSection === 'profile'"
          id="settings-panel"
          class="settings-card"
          role="region"
          aria-labelledby="settings-tab-profile"
        >
          <div class="avatar-editor">
            <div class="avatar-preview"><img v-if="auth.user?.avatarUrl" :src="auth.user.avatarUrl" alt="当前头像"><AppIcon v-else name="user" :size="32" /></div>
            <div><input ref="avatarInput" type="file" hidden accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" @change="uploadAvatar"><button class="secondary-button" @click="avatarInput?.click()"><AppIcon name="upload" :size="16" />更换头像</button><span class="form-hint">自动裁剪为方形，最大 5 MB</span></div>
          </div>
          <div class="form-row"><label>登录账户</label><el-input :model-value="auth.user?.account" disabled /><span class="form-hint">登录账户不可修改，显示用户名可以随时更改。</span></div>
          <div class="form-row"><label>显示用户名</label><el-input v-model="displayName" maxlength="40" /></div>
          <button class="primary-button" :disabled="savingProfile" @click="saveProfile">保存个人资料</button>
        </div>

        <div
          v-else-if="activeSection === 'security'"
          id="settings-panel"
          class="settings-card"
          role="region"
          aria-labelledby="settings-tab-security"
        >
          <div class="form-row"><label>当前密码</label><el-input v-model="password.currentPassword" type="password" show-password autocomplete="current-password" /></div>
          <div class="form-row"><label>新密码</label><el-input v-model="password.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 6 位" /></div>
          <div class="form-row"><label>确认新密码</label><el-input v-model="password.confirm" type="password" show-password autocomplete="new-password" /></div>
          <p class="form-hint security-hint">修改密码后，当前登录会话仍然有效。</p>
          <button class="secondary-button" @click="changePassword">修改密码</button>
        </div>

        <div
          v-else
          id="settings-panel"
          class="settings-card"
          role="region"
          aria-labelledby="settings-tab-ai"
        >
          <p class="settings-card-intro">API 码在服务端加密存储，页面不会回显完整密钥。</p>
          <div class="privacy-notice">只有你在图片详情页点击“AI 优化”时，当前图片才会发送到这里配置的服务商。普通上传、浏览和本地编辑不会向该接口发送图片。</div>
          <div class="ai-settings-grid">
            <div>
              <div class="form-row"><label>API 地址</label><el-input v-model="ai.baseUrl" placeholder="https://your-ai-service.example/enhance" /><span class="form-hint">接口接收 multipart 的 image、mode、model 字段。</span></div>
              <div class="form-row"><label>模型名称（可选）</label><el-input v-model="ai.model" placeholder="由你的 AI 服务决定" /></div>
            </div>
            <div>
              <div class="form-row"><label>API 码</label><el-input v-model="ai.apiKey" type="password" show-password :placeholder="ai.configured ? `已保存 ${ai.maskedKey}，留空则不变` : '请输入 API 码'" autocomplete="off" /></div>
              <div class="form-row"><label>超时时间（秒）</label><el-input-number v-model="ai.timeout" :min="5" :max="120" style="width: 100%" /></div>
            </div>
          </div>
          <p class="form-hint">接口需返回图片二进制，或包含 image / b64_json / output 的 base64 JSON。本应用不接受远端图片 URL 作为处理结果。</p>
          <div class="settings-actions">
            <button class="primary-button" :disabled="aiLoading" @click="saveAi">保存 AI 配置</button>
            <button class="secondary-button" :disabled="!ai.configured || testing" @click="testAi">{{ testing ? '正在测试…' : '测试连接' }}</button>
            <button v-if="ai.configured" class="danger-button" @click="clearAi">清除配置</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
