<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const auth = useAuthStore()
const users = ref<any[]>([])
const dialog = ref(false)
const creating = ref(false)
const form = reactive({ account: '', displayName: '', password: '', role: 'USER' })

onMounted(loadUsers)
async function loadUsers() { users.value = await $fetch<any[]>('/api/admin/users') }
async function createUser() {
  creating.value = true
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: form })
    Object.assign(form, { account: '', displayName: '', password: '', role: 'USER' })
    dialog.value = false
    await loadUsers()
    ElMessage.success('用户已创建')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '创建失败')
  } finally { creating.value = false }
}
async function changeRole(user: any) {
  const role = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { role } })
    await loadUsers()
  } catch (error: any) { ElMessage.error(error?.data?.statusMessage || '修改失败') }
}
async function resetPassword(user: any) {
  const { value } = await ElMessageBox.prompt(`为 ${user.displayName} 设置新密码（至少 6 位）`, '重置密码', { inputType: 'password', inputValidator: (value) => value.length >= 6 || '至少 6 位' })
  await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { password: value } })
  ElMessage.success('密码已重置')
}
async function removeUser(user: any) {
  await ElMessageBox.confirm(`删除 ${user.displayName} 会同时删除其全部相册和图片文件，且无法恢复。`, '删除用户', { type: 'error', confirmButtonText: '永久删除' })
  await $fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
  await loadUsers()
  ElMessage.success('用户已删除')
}
</script>

<template>
  <section>
    <div class="page-heading"><div><h1>用户管理</h1><p>账户彼此隔离，管理员不默认浏览其他用户的私人图片。</p></div><button class="primary-button" @click="dialog = true"><AppIcon name="plus" :size="17" />新增用户</button></div>
    <div class="admin-table">
      <div class="admin-row header"><span>用户</span><span>账户</span><span>角色</span><span>图片 / 相册</span><span>操作</span></div>
      <div v-for="user in users" :key="user.id" class="admin-row">
        <strong>{{ user.displayName }}</strong><span>{{ user.account }}</span><span>{{ user.role === 'ADMIN' ? '管理员' : '普通用户' }}</span><span>{{ user.photoCount }} / {{ user.albumCount }}</span>
        <div class="page-actions">
          <el-button v-if="user.id !== auth.user?.id" size="small" @click="changeRole(user)">设为{{ user.role === 'ADMIN' ? '普通用户' : '管理员' }}</el-button>
          <el-button size="small" @click="resetPassword(user)">重置密码</el-button>
          <el-button v-if="user.id !== auth.user?.id" size="small" type="danger" plain @click="removeUser(user)">删除</el-button>
        </div>
      </div>
    </div>
    <el-dialog v-model="dialog" title="新增用户" width="460px">
      <div class="form-row"><label>登录账户</label><el-input v-model="form.account" placeholder="3-40 位字母、数字或 _ . -" /></div>
      <div class="form-row"><label>显示用户名</label><el-input v-model="form.displayName" /></div>
      <div class="form-row"><label>初始密码</label><el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" /></div>
      <div class="form-row"><label>角色</label><el-radio-group v-model="form.role"><el-radio value="USER">普通用户</el-radio><el-radio value="ADMIN">管理员</el-radio></el-radio-group></div>
      <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" :loading="creating" @click="createUser">创建</el-button></template>
    </el-dialog>
  </section>
</template>
