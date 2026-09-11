import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db/index'
import { absoluteAppUrl, sendEmail } from '@/lib/email'

export const auth = betterAuth({
  database: pool,
  baseURL: {
    allowedHosts: [
      'cloudie-five.vercel.app',
      '*.vercel.app',
      ...(process.env.NODE_ENV === 'development' ? ['localhost:3000', 'localhost:5173'] : []),
    ],
    protocol: process.env.NODE_ENV === 'development' ? 'http' : 'https',
    fallback: absoluteAppUrl('/'),
  },
  user: { modelName: 'User' },
  session: { modelName: 'Session', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  account: { modelName: 'Account' },
  verification: { modelName: 'Verification' },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: 'Verify your Cloudie email',
        text: `Verify your Cloudie account: ${url}`,
        html: `<p>Welcome to Cloudie.</p><p><a href="${url}">Verify your email address</a></p><p>This link expires according to your Cloudie authentication policy.</p>`,
      }).catch((error) => console.error('verification email failed', error))
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: 'Reset your Cloudie password',
        text: `Reset your Cloudie password: ${url}`,
        html: `<p>A password reset was requested for your Cloudie account.</p><p><a href="${url}">Reset your password</a></p><p>If you did not request this, you can safely ignore this message.</p>`,
      }).catch((error) => console.error('password reset email failed', error))
    },
  },
  trustedOrigins: [
    absoluteAppUrl('/'),
    'https://cloudie-five.vercel.app',
    'https://*.vercel.app',
    ...(process.env.NODE_ENV === 'development' ? [
      'http://localhost:3000',
      'http://localhost:5173',
      ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
      ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
      ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
      ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
    ] : []),
  ],
})
