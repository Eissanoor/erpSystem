import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as shopService from './shop.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await shopService.list(req.query, req.user)
  sendSuccess(res, { message: 'Shops fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await shopService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Shop fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await shopService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Shop created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await shopService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Shop updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await shopService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Shop updated', data })
})
