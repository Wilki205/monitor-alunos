import dotenv from 'dotenv'

dotenv.config()

export const env = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || ''
}