import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as quantityUnitService from './quantityUnit.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await quantityUnitService.list(req.query, req.user)
  sendSuccess(res, { message: 'Quantity units fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await quantityUnitService.getById(req.params.id)
  sendSuccess(res, { message: 'Quantity unit fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await quantityUnitService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Quantity unit created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await quantityUnitService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Quantity unit updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await quantityUnitService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Quantity unit updated', data })
})
