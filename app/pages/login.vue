<script setup lang="ts">
import { ElMessage } from 'element-plus'

definePageMeta({ layout: false })
const auth = useAuthStore()
const form = reactive({ account: '', password: '' })
const loading = ref(false)

async function submit() {
  if (!form.account || !form.password) return ElMessage.warning('请输入账户和密码')
  loading.value = true
  try {
    await auth.login(form.account, form.password)
    await navigateTo('/')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '登录失败，请检查账户和密码')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-story">
      <div class="login-brand"><AppIcon name="logo" :size="34" /><span>ImageBook</span></div>
      <div class="login-copy">
        <p class="eyebrow">YOUR PRIVATE PHOTO LIBRARY</p>
        <h1>把每一张照片，<br>和它的故事放在一起。</h1>
        <p>图片只保存在你的网站里。整理相册、写下感受，也让每一次编辑都有迹可循。</p>
      </div>
      <div class="login-photo-stack" aria-hidden="true">
        <div class="story-card card-one"><AppIcon name="images" :size="56" /></div>
        <div class="story-card card-two"><AppIcon name="note" :size="44" /></div>
      </div>
    </section>
    <section class="login-panel">
      <form class="login-form" @submit.prevent="submit">
        <div class="mobile-brand"><AppIcon name="logo" :size="30" /> ImageBook</div>
        <p class="eyebrow">WELCOME BACK</p>
        <h2>登录你的图片库</h2>
        <p class="muted">使用账户登录，显示用户名可登录后修改。</p>
        <label>账户</label>
        <el-input v-model="form.account" size="large" placeholder="请输入账户" autocomplete="username" @keyup.enter="submit" />
        <label>密码</label>
        <el-input v-model="form.password" size="large" type="password" show-password placeholder="请输入密码" autocomplete="current-password" @keyup.enter="submit" />
        <el-button type="primary" size="large" :loading="loading" native-type="submit" class="login-button">登录</el-button>
        <p class="login-hint">初始管理员：panny / panny</p>
      </form>
    </section>
  </main>
</template>
