import { requireAuth } from '../../../utils/auth'
import { getAiConfig } from '../../../services/ai'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return getAiConfig(event, user.id)
})
