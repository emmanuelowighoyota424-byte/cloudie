import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import { pool } from '@/lib/db/index'

export const authTest = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000',
  user: { modelName: 'User' },
  session: { modelName: 'Session', expiresIn: 60 * 60, updateAge: 60 * 60 },
  account: { modelName: 'Account' },
  verification: { modelName: 'Verification' },
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [testUtils()],
})

export async function getTestAuth() {
  const context = await authTest.$context
  return context.test
}
