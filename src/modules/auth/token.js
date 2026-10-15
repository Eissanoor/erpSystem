import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { ApiError } from '../../common/utils/ApiError.js'

function sign(userId, type, secret, expiresIn) {
  return jwt.sign({ sub: String(userId), type }, secret, { expiresIn })
}

function verify(token, secret, type, message) {
  try {
    const payload = jwt.verify(token, secret)
    if (!payload || payload.type !== type || !payload.sub) {
      throw new ApiError(401, message)
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(401, message)
  }
}

export function signAccessToken(userId) {
  return sign(userId, 'access', env.jwtAccessSecret, env.jwtAccessExpires)
}

export function signRefreshToken(userId) {
  return sign(userId, 'refresh', env.jwtRefreshSecret, env.jwtRefreshExpires)
}

export function verifyAccessToken(token) {
  return verify(token, env.jwtAccessSecret, 'access', 'Invalid or expired access token')
}

export function verifyRefreshToken(token) {
  return verify(token, env.jwtRefreshSecret, 'refresh', 'Invalid or expired refresh token')
}
