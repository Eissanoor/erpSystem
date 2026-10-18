import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as currencyService from './currency.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await currencyService.list(req.query, req.user)
  sendSuccess(res, { message: 'Currencies fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await currencyService.getById(req.params.id)
  sendSuccess(res, { message: 'Currency fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await currencyService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Currency created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await currencyService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Currency updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await currencyService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Currency updated', data })
})
