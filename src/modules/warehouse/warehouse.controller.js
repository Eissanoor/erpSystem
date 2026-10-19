import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as warehouseService from './warehouse.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await warehouseService.list(req.query, req.user)
  sendSuccess(res, { message: 'Warehouses fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await warehouseService.getById(req.params.id, req.user, req.query)
  sendSuccess(res, { message: 'Warehouse fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await warehouseService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Warehouse created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await warehouseService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Warehouse updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await warehouseService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Warehouse updated', data })
})
