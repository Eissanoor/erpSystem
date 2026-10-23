import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as supplierService from './supplier.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await supplierService.list(req.query, req.user)
  sendSuccess(res, { message: 'Suppliers fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await supplierService.getById(req.params.id, req.query, req.user)
  sendSuccess(res, { message: 'Supplier fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await supplierService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Supplier created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await supplierService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Supplier updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await supplierService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Supplier updated', data })
})
