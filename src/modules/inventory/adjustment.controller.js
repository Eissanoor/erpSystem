import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as adjustmentService from './adjustment.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await adjustmentService.list(req.query, req.user)
  sendSuccess(res, { message: 'Adjustments fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await adjustmentService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Adjustment fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await adjustmentService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Adjustment created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await adjustmentService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Adjustment updated', data })
})

export const submit = asyncHandler(async (req, res) => {
  const data = await adjustmentService.submit(req.params.id, req.user)
  sendSuccess(res, { message: 'Adjustment submitted', data })
})

export const approve = asyncHandler(async (req, res) => {
  const data = await adjustmentService.approve(req.params.id, req.user)
  sendSuccess(res, { message: 'Adjustment approved', data })
})

export const reject = asyncHandler(async (req, res) => {
  const data = await adjustmentService.reject(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Adjustment rejected', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await adjustmentService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Adjustment cancelled', data })
})
