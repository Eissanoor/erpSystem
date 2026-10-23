import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as transferService from './transfer.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await transferService.list(req.query, req.user)
  sendSuccess(res, { message: 'Transfers fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await transferService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Transfer fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await transferService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Transfer created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await transferService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Transfer updated', data })
})

export const dispatch = asyncHandler(async (req, res) => {
  const data = await transferService.dispatch(req.params.id, req.user)
  sendSuccess(res, { message: 'Transfer dispatched', data })
})

export const receive = asyncHandler(async (req, res) => {
  const data = await transferService.receive(req.params.id, req.user)
  sendSuccess(res, { message: 'Transfer received', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await transferService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Transfer cancelled', data })
})
