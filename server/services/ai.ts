import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '../utils/prisma'

const SETTING_KEY = 'ai.config'

interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
}

function encryptionKey(event: any) {
  const secret = useRuntimeConfig(event).settingSecret
  if (!secret) throw createError({ statusCode: 500, statusMessage: '服务器未配置 SETTING_SECRET' })
  return createHash('sha256').update(secret).digest()
}

function encrypt(value: string, event: any) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(event), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

function decrypt(value: string, event: any) {
  const [iv, tag, data] = value.split('.')
  if (!iv || !tag || !data) throw createError({ statusCode: 500, statusMessage: 'AI 配置已损坏，请重新保存' })
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(event), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

function validateConfig(config: AiConfig) {
  const url = new URL(config.baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址仅支持 HTTP 或 HTTPS')
  if (!config.apiKey) throw new Error('请填写 API 码')
  config.timeout = Math.min(120, Math.max(5, Number(config.timeout) || 60))
  return config
}

export async function getAiConfig(event: any, userId: string, includeSecret = false): Promise<Partial<AiConfig> & { configured?: boolean; maskedKey?: string }> {
  const setting = await prisma.userSetting.findUnique({ where: { userId_key: { userId, key: SETTING_KEY } } })
  if (!setting) return { baseUrl: '', model: '', timeout: 60, configured: false, maskedKey: '' }
  const config = JSON.parse(decrypt(setting.value, event)) as AiConfig
  if (includeSecret) return config
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    timeout: config.timeout,
    configured: Boolean(config.apiKey),
    maskedKey: config.apiKey ? `••••••••${config.apiKey.slice(-4)}` : ''
  }
}

export async function saveAiConfig(event: any, userId: string, input: AiConfig & { clear?: boolean }) {
  if (input.clear) {
    await prisma.userSetting.deleteMany({ where: { userId, key: SETTING_KEY } })
    return
  }
  const previous = await getAiConfig(event, userId, true) as AiConfig
  const config = validateConfig({
    baseUrl: input.baseUrl?.trim() || '',
    apiKey: input.apiKey?.trim() || previous.apiKey || '',
    model: input.model?.trim() || '',
    timeout: Number(input.timeout) || 60
  })
  await prisma.userSetting.upsert({
    where: { userId_key: { userId, key: SETTING_KEY } },
    create: { userId, key: SETTING_KEY, value: encrypt(JSON.stringify(config), event) },
    update: { value: encrypt(JSON.stringify(config), event) }
  })
}

async function parseAiResponse(response: Response) {
  if (!response.ok) {
    const message = (await response.text()).slice(0, 300)
    throw createError({ statusCode: 502, statusMessage: `AI 服务返回 ${response.status}：${message}` })
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType.startsWith('image/')) return Buffer.from(await response.arrayBuffer())
  const body = await response.json() as any
  const base64 = body.image || body.b64_json || body.data?.[0]?.b64_json || body.output
  if (typeof base64 === 'string' && base64) {
    return Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  }
  throw createError({ statusCode: 502, statusMessage: 'AI 接口需返回图片二进制或 base64，不支持远端图片 URL' })
}

export async function requestAiEnhancement(event: any, userId: string, image: Buffer, originalName: string, mode: string) {
  const stored = await getAiConfig(event, userId, true) as AiConfig
  if (!stored.baseUrl || !stored.apiKey) {
    throw createError({ statusCode: 400, statusMessage: '请先在设置页填写 AI API 地址和 API 码' })
  }
  const config = validateConfig(stored)
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(image)]), originalName)
  form.append('mode', mode)
  if (config.model) form.append('model', config.model)
  let response: Response
  try {
    response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(config.timeout * 1000)
    })
  } catch (error: any) {
    throw createError({ statusCode: 502, statusMessage: `无法连接 AI 服务：${error.message}` })
  }
  return parseAiResponse(response)
}

export async function testAiConnection(event: any, userId: string) {
  const sample = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#d7c6ad' } }).png().toBuffer()
  const result = await requestAiEnhancement(event, userId, sample, 'connection-test.png', 'test')
  try {
    await sharp(result).metadata()
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'AI 服务已连接，但返回内容不是有效图片' })
  }
}
