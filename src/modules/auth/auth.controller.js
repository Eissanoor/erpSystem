import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as authService from './auth.service.js'

export const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body)
  sendSuccess(res, { message: 'Logged in', data })
})

export const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refresh(req.body)
  sendSuccess(res, { message: 'Token refreshed', data })
})

export const logout = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    message: 'Logged out. The access token stays valid until it expires.',
    data: { loggedOut: true },
  })
})

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Profile fetched', data: req.user })
})
