import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as customerService from './customer.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await customerService.list(req.query, req.user)
  sendSuccess(res, { message: 'Customers fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await customerService.getById(req.params.id, req.query, req.user)
  sendSuccess(res, { message: 'Customer fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await customerService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Customer created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await customerService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Customer updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await customerService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Customer updated', data })
})
