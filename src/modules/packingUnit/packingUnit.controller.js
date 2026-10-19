import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as packingUnitService from './packingUnit.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await packingUnitService.list(req.query, req.user)
  sendSuccess(res, { message: 'Packing units fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await packingUnitService.getById(req.params.id)
  sendSuccess(res, { message: 'Packing unit fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await packingUnitService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Packing unit created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await packingUnitService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Packing unit updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await packingUnitService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Packing unit updated', data })
})
