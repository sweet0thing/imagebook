import type { User } from '~/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as User | null, loaded: false }),
  actions: {
    async fetchMe() {
      try {
        const response = await $fetch<{ user: User }>('/api/auth/me')
        this.user = response.user
      } catch {
        this.user = null
      } finally {
        this.loaded = true
      }
    },
    async login(account: string, password: string) {
      const response = await $fetch<{ user: User }>('/api/auth/login', { method: 'POST', body: { account, password } })
      this.user = response.user
      this.loaded = true
    },
    async logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      this.user = null
      await navigateTo('/login')
    }
  }
})
