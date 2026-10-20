import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as ownerService from './owner.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await ownerService.list(req.query, req.user)
  sendSuccess(res, { message: 'Owners fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await ownerService.getById(req.params.id, req.user, req.query)
  sendSuccess(res, { message: 'Owner fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await ownerService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Owner created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await ownerService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Owner updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await ownerService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Owner updated', data })
})
