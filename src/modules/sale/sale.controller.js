import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as saleService from './sale.service.js'

export const workspace = asyncHandler(async (req, res) => {
  const data = await saleService.workspace(req.query, req.user)
  sendSuccess(res, { message: 'Sales workspace fetched', data })
})

export const list = asyncHandler(async (req, res) => {
  const result = await saleService.list(req.query, req.user)
  sendSuccess(res, { message: 'Sales fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await saleService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Sale fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await saleService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Sale created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await saleService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Sale updated', data })
})

export const approve = asyncHandler(async (req, res) => {
  const data = await saleService.approve(req.params.id, req.user)
  sendSuccess(res, { message: 'Sale approved', data })
})

export const post = asyncHandler(async (req, res) => {
  const data = await saleService.post(req.params.id, req.user)
  sendSuccess(res, { message: 'Sale posted', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await saleService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Sale cancelled', data })
})
