import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as branchService from './branch.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await branchService.list(req.query, req.user)
  sendSuccess(res, { message: 'Branches fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await branchService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Branch fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await branchService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Branch created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await branchService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Branch updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await branchService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Branch updated', data })
})
