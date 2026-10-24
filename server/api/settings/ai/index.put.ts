import { z } from 'zod'
import { requireAuth } from '../../../utils/auth'
import { getAiConfig, saveAiConfig } from '../../../services/ai'

const schema = z.object({
  baseUrl: z.string().max(2000).optional().default(''),
  apiKey: z.string().max(2000).optional().default(''),
  model: z.string().max(200).optional().default(''),
  timeout: z.coerce.number().min(5).max(120).optional().default(60),
  clear: z.boolean().optional().default(false)
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, schema.parse)
  try {
    await saveAiConfig(event, user.id, body)
  } catch (error: any) {
    throw createError({ statusCode: 400, statusMessage: error.message || 'AI 配置无效' })
  }
  return getAiConfig(event, user.id)
})
