import { requireAuth } from '../../../utils/auth'
import { testAiConnection } from '../../../services/ai'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await testAiConnection(event, user.id)
  return { ok: true }
})
