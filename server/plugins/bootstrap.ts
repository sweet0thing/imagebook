import bcrypt from 'bcryptjs'
import { prisma } from '../utils/prisma'
import { ensureStorage } from '../utils/storage'

export default defineNitroPlugin(async () => {
  await ensureStorage()
  const admin = await prisma.user.findUnique({ where: { account: 'panny' } })
  if (!admin) {
    await prisma.user.create({
      data: {
        account: 'panny',
        displayName: 'panny',
        role: 'ADMIN',
        passwordHash: await bcrypt.hash('panny', 12)
      }
    })
  }
})
