import jwt from 'jsonwebtoken'
import { getCookie, getHeader, getMethod, getRequestHost, setCookie, deleteCookie } from 'h3'
import type { H3Event } from 'h3'
import { prisma } from './prisma'

const COOKIE_NAME = 'imagebook_token'

export function safeUser(user: any) {
  return {
    id: user.id,
    account: user.account,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarPath ? `/api/me/avatar?v=${encodeURIComponent(user.updatedAt?.toISOString?.() || '')}` : null
  }
}

export function createSession(event: H3Event, userId: string) {
  const secret = useRuntimeConfig(event).authSecret
  if (!secret) throw createError({ statusCode: 500, statusMessage: '服务器未配置 AUTH_SECRET' })
  const token = jwt.sign({ sub: userId }, secret, { expiresIn: '7d' })
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  })
}

export function clearAuthSession(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

async function currentUser(event: H3Event) {
  const token = getCookie(event, COOKIE_NAME)
  if (!token) return null
  try {
    const secret = useRuntimeConfig(event).authSecret
    if (!secret) return null
    const payload = jwt.verify(token, secret) as jwt.JwtPayload
    if (!payload.sub) return null
    return await prisma.user.findUnique({ where: { id: payload.sub } })
  } catch {
    return null
  }
}

export async function requireAuth(event: H3Event) {
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: '请先登录' })

  if (!['GET', 'HEAD', 'OPTIONS'].includes(getMethod(event))) {
    const origin = getHeader(event, 'origin')
    if (origin) {
      let originHost = ''
      try { originHost = new URL(origin).host } catch { /* rejected below */ }
      if (originHost !== getRequestHost(event)) {
        throw createError({ statusCode: 403, statusMessage: '请求来源无效' })
      }
    }
  }
  return user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireAuth(event)
  if (user.role !== 'ADMIN') throw createError({ statusCode: 403, statusMessage: '需要管理员权限' })
  return user
}
