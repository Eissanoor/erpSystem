import dotenv from 'dotenv'

dotenv.config({ quiet: true })

function required(name, fallbacks = []) {
  const value = process.env[name] || fallbacks.map((key) => process.env[key]).find(Boolean)
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

const nodeEnv = process.env.NODE_ENV || 'development'
const isProduction = nodeEnv === 'production'

function readEnv(name, fallback = '') {
  const value = process.env[name]
  if (typeof value === 'string' && value.length > 0) return value
  return fallback
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 2507),
  mongodbUri: required('MONGODB_URI'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', ['JWT_SECRET']),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', ['JWT_SECRET']),
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  isProduction,
  seedAdminEmail: readEnv('SEED_ADMIN_EMAIL', isProduction ? '' : 'admin@gulzar.local').trim().toLowerCase(),
  seedAdminPassword: readEnv('SEED_ADMIN_PASSWORD', isProduction ? '' : 'Admin@12345'),
  seedAdminName: readEnv('SEED_ADMIN_NAME', 'Super Admin').trim() || 'Super Admin',
}
