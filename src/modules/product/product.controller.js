import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as productService from './product.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await productService.list(req.query, req.user)
  sendSuccess(res, { message: 'Products fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await productService.getById(req.params.id)
  sendSuccess(res, { message: 'Product fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await productService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Product created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await productService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Product updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await productService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Product updated', data })
})
