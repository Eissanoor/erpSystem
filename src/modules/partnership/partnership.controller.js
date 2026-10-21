import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as partnershipService from './partnership.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await partnershipService.list(req.query, req.user)
  sendSuccess(res, { message: 'Partnerships fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await partnershipService.getById(req.params.id, req.user, req.query)
  sendSuccess(res, { message: 'Partnership fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await partnershipService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Partnership created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await partnershipService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Partnership updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await partnershipService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Partnership updated', data })
})
