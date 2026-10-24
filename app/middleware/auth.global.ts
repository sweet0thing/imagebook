export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()
  if (!auth.user && to.path !== '/login') return navigateTo('/login')
  if (auth.user && to.path === '/login') return navigateTo('/')
  if (to.path.startsWith('/admin') && auth.user?.role !== 'ADMIN') return navigateTo('/')
})
