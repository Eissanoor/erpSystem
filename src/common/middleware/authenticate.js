import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { verifyAccessToken } from '../../modules/auth/token.js'
import { getAuthUser } from '../../modules/auth/auth.cache.js'

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || ''
  const match = /^Bearer\s+(\S+)/i.exec(header)
  if (!match) throw new ApiError(401, 'Authentication required')

  const payload = verifyAccessToken(match[1])
  const authUser = await getAuthUser(payload.sub)
  if (!authUser) throw new ApiError(401, 'Authentication required')
  if (authUser.status !== 'active') throw new ApiError(403, 'Account is not active')

  req.user = authUser
  next()
})
