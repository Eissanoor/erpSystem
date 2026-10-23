import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as saleReturnService from './saleReturn.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await saleReturnService.list(req.query, req.user)
  sendSuccess(res, { message: 'Sales returns fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await saleReturnService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Sales return fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await saleReturnService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Sales return created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await saleReturnService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Sales return updated', data })
})

export const approve = asyncHandler(async (req, res) => {
  const data = await saleReturnService.approve(req.params.id, req.user)
  sendSuccess(res, { message: 'Sales return approved', data })
})

export const post = asyncHandler(async (req, res) => {
  const data = await saleReturnService.post(req.params.id, req.user)
  sendSuccess(res, { message: 'Sales return posted', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await saleReturnService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Sales return cancelled', data })
})
