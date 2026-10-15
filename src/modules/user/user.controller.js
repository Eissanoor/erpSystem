import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as userService from './user.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await userService.list(req.query)
  sendSuccess(res, { message: 'Users fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await userService.getById(req.params.id)
  sendSuccess(res, { message: 'User fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await userService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'User created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await userService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'User updated', data })
})

export const updateAccess = asyncHandler(async (req, res) => {
  const data = await userService.updateAccess(req.params.id, req.body)
  sendSuccess(res, { message: 'Access updated', data })
})
