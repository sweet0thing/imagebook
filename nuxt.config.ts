export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/styles/main.css'],
  typescript: { strict: true },
  runtimeConfig: {
    authSecret: process.env.AUTH_SECRET,
    settingSecret: process.env.SETTING_SECRET,
    storageDir: process.env.STORAGE_DIR,
    public: { appName: 'ImageBook' }
  },
  nitro: {
    experimental: { asyncContext: true }
  },
  vite: {
    optimizeDeps: { include: ['konva'] }
  }
})
