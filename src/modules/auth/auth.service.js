import { ApiError } from '../../common/utils/ApiError.js'
import { User } from '../user/user.model.js'
import { clearAuthUser, getAuthUser } from './auth.cache.js'
import { checkPassword } from './password.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.js'

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user) throw new ApiError(401, 'Invalid email or password')

  const matches = await checkPassword(password, user.passwordHash)
  if (!matches) throw new ApiError(401, 'Invalid email or password')
  if (user.status !== 'active') throw new ApiError(403, 'Account is not active')

  user.lastLoginAt = new Date()
  await user.save()
  clearAuthUser(user._id)

  const authUser = await getAuthUser(user._id)
  return {
    user: authUser,
    accessToken: signAccessToken(user._id),
    refreshToken: signRefreshToken(user._id),
  }
}

export async function refresh({ refreshToken }) {
  const payload = verifyRefreshToken(refreshToken)
  const authUser = await getAuthUser(payload.sub)
  if (!authUser) throw new ApiError(401, 'Invalid or expired refresh token')
  if (authUser.status !== 'active') throw new ApiError(403, 'Account is not active')

  return {
    user: authUser,
    accessToken: signAccessToken(authUser._id),
    refreshToken: signRefreshToken(authUser._id),
  }
}
